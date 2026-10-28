import Foundation
import CoreMedia
import CoreGraphics
import AppKit
import ScreenCaptureKit

private let targetSampleRate: Double = 24_000
private let outputChunkBytes = 4_800 // 100 ms of mono PCM16 @ 24 kHz

private func log(_ message: String) {
    guard let data = "FloatLingoAudio: \(message)\n".data(using: .utf8) else { return }
    try? FileHandle.standardError.write(contentsOf: data)
}

private func fail(_ message: String, code: Int32 = 1) -> Never {
    log("ERROR \(message)")
    exit(code)
}

@main
enum SystemAudioCaptureMain {
    static func main() async {
        let capture = AudioCapture()
        do {
            try await capture.start()
        } catch {
            log("无法启动系统音频捕获: \(error.localizedDescription)")
            log("请确认已在“系统设置 → 隐私与安全性 → 屏幕与系统音频录制”中允许本应用。")
            exit(2)
        }
        dispatchMain()
    }
}

final class AudioCapture: NSObject, SCStreamOutput, SCStreamDelegate {
    private var stream: SCStream?
    private let audioQueue = DispatchQueue(label: "com.floatlingo.systemaudio", qos: .userInteractive)
    private var pending = Data()
    private var flushTimer: DispatchSourceTimer?
    private var formatLogged = false

    func start() async throws {
        // ScreenCaptureKit capture runs in a background helper. Activating the
        // app and explicitly requesting screen-capture access makes the macOS
        // privacy prompt appear instead of silently returning a denial.
        await MainActor.run {
            NSApplication.shared.setActivationPolicy(.accessory)
            NSApplication.shared.activate(ignoringOtherApps: true)
        }

        if !CGPreflightScreenCaptureAccess() {
            log("requesting screen capture permission…")
            let granted = CGRequestScreenCaptureAccess()
            log("CGRequestScreenCaptureAccess=\(granted)")
        }

        log("requesting ScreenCaptureKit access…")
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        guard let display = content.displays.first else {
            throw NSError(domain: "FloatLingoAudio", code: 10, userInfo: [
                NSLocalizedDescriptionKey: "没有可捕获的显示器"
            ])
        }

        let filter = SCContentFilter(display: display, excludingWindows: [])
        let config = SCStreamConfiguration()
        config.capturesAudio = true
        config.sampleRate = 48_000
        config.channelCount = 2
        config.excludesCurrentProcessAudio = true
        config.width = 16
        config.height = 16
        config.minimumFrameInterval = CMTime(value: 1, timescale: 1)
        config.queueDepth = 3
        config.showsCursor = false

        let stream = SCStream(filter: filter, configuration: config, delegate: self)
        try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: audioQueue)
        try await stream.startCapture()
        self.stream = stream

        let timer = DispatchSource.makeTimerSource(queue: audioQueue)
        timer.schedule(deadline: .now() + .milliseconds(100), repeating: .milliseconds(100))
        timer.setEventHandler { [weak self] in
            self?.flush(force: false)
        }
        timer.resume()
        self.flushTimer = timer

        log("READY display=\(display.displayID) \(display.width)x\(display.height)")
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio, sampleBuffer.isValid else { return }
        guard let formatDescription = CMSampleBufferGetFormatDescription(sampleBuffer),
              let asbdPointer = CMAudioFormatDescriptionGetStreamBasicDescription(formatDescription) else {
            return
        }
        let asbd = asbdPointer.pointee

        if !formatLogged {
            formatLogged = true
            log("audio format: \(asbd.mSampleRate) Hz, channels=\(asbd.mChannelsPerFrame), bits=\(asbd.mBitsPerChannel), flags=\(asbd.mFormatFlags), frames=\(CMSampleBufferGetNumSamples(sampleBuffer))")
        }

        let frameCount = CMSampleBufferGetNumSamples(sampleBuffer)
        guard frameCount > 0 else { return }

        let channels = max(1, Int(asbd.mChannelsPerFrame))
        let listSize = MemoryLayout<AudioBufferList>.size + (channels - 1) * MemoryLayout<AudioBuffer>.size
        let rawList = UnsafeMutableRawPointer.allocate(
            byteCount: listSize,
            alignment: MemoryLayout<AudioBufferList>.alignment
        )
        defer { rawList.deallocate() }
        let listPointer = rawList.bindMemory(to: AudioBufferList.self, capacity: 1)
        var blockBuffer: CMBlockBuffer?

        let status = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
            sampleBuffer,
            bufferListSizeNeededOut: nil,
            bufferListOut: listPointer,
            bufferListSize: listSize,
            blockBufferAllocator: kCFAllocatorDefault,
            blockBufferMemoryAllocator: kCFAllocatorDefault,
            flags: 0,
            blockBufferOut: &blockBuffer
        )
        guard status == noErr else {
            log("AudioBufferList extraction failed: \(status)")
            return
        }

        let buffers = UnsafeMutableAudioBufferListPointer(listPointer)
        guard buffers.count > 0 else { return }

        var pointers: [UnsafeRawPointer] = []
        pointers.reserveCapacity(buffers.count)
        for index in 0..<buffers.count {
            guard let data = buffers[index].mData else { return }
            pointers.append(UnsafeRawPointer(data))
        }

        let isFloat = (asbd.mFormatFlags & kAudioFormatFlagIsFloat) != 0
        let isNonInterleaved = (asbd.mFormatFlags & kAudioFormatFlagIsNonInterleaved) != 0
        let bits = Int(asbd.mBitsPerChannel)
        let inputRate = asbd.mSampleRate > 0 ? asbd.mSampleRate : 48_000
        let ratio = inputRate / targetSampleRate
        let outputFrames = max(0, Int((Double(frameCount) / ratio).rounded(.down)))

        @inline(__always) func rawSample(_ frame: Int, _ channel: Int) -> Float {
            let safeFrame = min(max(frame, 0), frameCount - 1)
            let safeChannel = min(max(channel, 0), channels - 1)
            let bufferIndex = isNonInterleaved ? min(safeChannel, pointers.count - 1) : 0
            let sampleIndex = isNonInterleaved ? safeFrame : safeFrame * channels + safeChannel
            let pointer = pointers[bufferIndex]

            if isFloat && bits == 32 {
                return pointer.assumingMemoryBound(to: Float.self)[sampleIndex]
            }
            if bits == 16 {
                return Float(pointer.assumingMemoryBound(to: Int16.self)[sampleIndex]) / 32_768.0
            }
            if bits == 32 {
                return Float(pointer.assumingMemoryBound(to: Int32.self)[sampleIndex]) / 2_147_483_648.0
            }
            return 0
        }

        var samples = [Int16]()
        samples.reserveCapacity(outputFrames)

        for outputIndex in 0..<outputFrames {
            let sourcePosition = Double(outputIndex) * ratio
            let lower = min(frameCount - 1, Int(sourcePosition))
            let upper = min(frameCount - 1, lower + 1)
            let fraction = Float(sourcePosition - Double(lower))

            var mixed: Float = 0
            for channel in 0..<channels {
                let a = rawSample(lower, channel)
                let b = rawSample(upper, channel)
                mixed += a + (b - a) * fraction
            }
            mixed /= Float(channels)

            let clamped = min(1.0, max(-1.0, mixed))
            samples.append(Int16(clamped * 32_767.0))
        }

        guard !samples.isEmpty else { return }
        samples.withUnsafeBufferPointer { buffer in
            pending.append(Data(buffer: buffer))
        }
        flush(force: false)
    }

    private func flush(force: Bool) {
        while pending.count >= outputChunkBytes {
            let chunk = pending.prefix(outputChunkBytes)
            pending.removeFirst(outputChunkBytes)
            do {
                try FileHandle.standardOutput.write(contentsOf: chunk)
            } catch {
                exit(0)
            }
        }
        if force && !pending.isEmpty {
            let chunk = pending
            pending.removeAll(keepingCapacity: true)
            try? FileHandle.standardOutput.write(contentsOf: chunk)
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        log("stream stopped: \(error.localizedDescription)")
        exit(3)
    }
}

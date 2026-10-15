import AVFoundation
import SwiftUI

/// Reads a word aloud with the system voices — offline, free, same languages
/// as the extension's 🔊.
@MainActor
enum Speech {
    private static let synth = AVSpeechSynthesizer()
    private static let locale = ["en": "en-US", "zh": "zh-CN", "es": "es-ES", "fr": "fr-FR", "ja": "ja-JP"]

    static func speak(_ text: String, lang: String) {
        // play even with the ring/silent switch on, and duck music instead of stopping it
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
        synth.stopSpeaking(at: .immediate)
        let u = AVSpeechUtterance(string: text)
        u.voice = bestVoice(for: locale[lang] ?? "en-US")
        u.rate = AVSpeechUtteranceDefaultSpeechRate * 0.9
        synth.speak(u)
    }

    /// Premium/enhanced voices sound far better when the user has downloaded them.
    private static func bestVoice(for code: String) -> AVSpeechSynthesisVoice? {
        AVSpeechSynthesisVoice.speechVoices()
            .filter { $0.language == code }
            .max { $0.quality.rawValue < $1.quality.rawValue }
            ?? AVSpeechSynthesisVoice(language: code)
    }
}

/// 🔊 button used on the review card and the word detail screen.
struct SpeakButton: View {
    let text: String
    let lang: String

    var body: some View {
        Button { Speech.speak(text, lang: lang) } label: {
            Image(systemName: "speaker.wave.2.fill")
        }
        .buttonStyle(.borderless)
        .accessibilityLabel("Pronounce \(text)")
    }
}

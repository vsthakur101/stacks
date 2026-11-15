// Stacks text recognition: reads PDF pages with Apple's Vision framework (offline, on this Mac).
// Built on first use by Stacks:  swiftc -O scripts/ocr/stacks-ocr.swift -o data/bin/stacks-ocr
// Usage: stacks-ocr <pdf> <first page> <last page> [languages, comma-separated]
// Prints one JSON line per page: {"page":N,"lines":[{"text":"…","x":0.1,"y":0.2,"w":0.5,"h":0.02}, …]}
// Boxes are fractions of the page, origin top-left.
import Foundation
import PDFKit
import Vision

let args = CommandLine.arguments
guard args.count >= 4, let doc = PDFDocument(url: URL(fileURLWithPath: args[1])), let first = Int(args[2]), let last = Int(args[3]) else {
  FileHandle.standardError.write("usage: stacks-ocr <pdf> <first> <last> [langs]\n".data(using: .utf8)!)
  exit(2)
}
let languages = args.count > 4 ? args[4].split(separator: ",").map(String.init) : ["hi-IN", "en-US"]

for p in max(1, first)...min(last, doc.pageCount) {
  autoreleasepool {
    guard let page = doc.page(at: p - 1) else { return }
    let box = page.bounds(for: .mediaBox)
    let scale: CGFloat = 2400 / max(box.width, box.height, 1)
    let image = page.thumbnail(of: CGSize(width: box.width * scale, height: box.height * scale), for: .mediaBox)
    var lines: [[String: Any]] = []
    if let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) {
      let req = VNRecognizeTextRequest()
      req.recognitionLevel = .accurate
      req.recognitionLanguages = languages
      req.usesLanguageCorrection = true
      try? VNImageRequestHandler(cgImage: cg).perform([req])
      for obs in req.results ?? [] {
        guard let text = obs.topCandidates(1).first?.string else { continue }
        let b = obs.boundingBox // normalised, origin bottom-left
        lines.append(["text": text, "x": b.minX, "y": 1 - b.maxY, "w": b.width, "h": b.height])
      }
    }
    let data = try! JSONSerialization.data(withJSONObject: ["page": p, "lines": lines])
    print(String(data: data, encoding: .utf8)!)
    fflush(stdout)
  }
}

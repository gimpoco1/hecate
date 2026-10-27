/*
 * Adapted from React Bits Topography by David Haz:
 * https://github.com/DavidHDev/react-bits/blob/main/src/ts-default/Backgrounds/Topography/Topography.tsx
 * Copyright (c) 2026 David Haz
 *
 * MIT + Commons Clause License Condition v1.0
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, and distribute the Software as part of
 * an application, website, or product, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * You may use this Software, including for any commercial purpose, so long as
 * you do not sell, sublicense, or redistribute the components themselves,
 * whether alone, in a bundle, or as a ported version.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import SwiftUI

/// A static slice of the leaderboard's wave field, rendered as vector contours rather than a WebGL loop.
struct JourneyTopographyBackground: View {
    @Environment(\.colorScheme) private var colorScheme
    var body: some View {
        Canvas { context, size in
            let columns = max(1, Int(ceil(size.width / 2)))
            let rows = max(1, Int(ceil(size.height / 2)))
            let field = (0...rows).map { row in
                (0...columns).map { column in
                    elevation(x: Double(column) / Double(columns), y: 1 - Double(row) / Double(rows))
                }
            }
            let maximumElevation = field.reduce(0) { maximum, row in max(maximum, row.reduce(0, max)) }
            let levels = Int(ceil(maximumElevation * 2.6))
            for band in 0..<levels {
                let level = Double(band + 1) / 2.6
                var path = Path()
                for row in 0..<rows {
                    for column in 0..<columns {
                        let points = [
                            CGPoint(x: Double(column) * size.width / Double(columns), y: Double(row) * size.height / Double(rows)),
                            CGPoint(x: Double(column + 1) * size.width / Double(columns), y: Double(row) * size.height / Double(rows)),
                            CGPoint(x: Double(column + 1) * size.width / Double(columns), y: Double(row + 1) * size.height / Double(rows)),
                            CGPoint(x: Double(column) * size.width / Double(columns), y: Double(row + 1) * size.height / Double(rows))
                        ]
                        let values = [field[row][column], field[row][column + 1], field[row + 1][column + 1], field[row + 1][column]]
                        let crossings = (0..<4).compactMap { edge -> CGPoint? in
                            let next = (edge + 1) % 4
                            guard (values[edge] < level) != (values[next] < level) else { return nil }
                            let fraction = (level - values[edge]) / (values[next] - values[edge])
                            return CGPoint(x: points[edge].x + (points[next].x - points[edge].x) * fraction,
                                           y: points[edge].y + (points[next].y - points[edge].y) * fraction)
                        }
                        if crossings.count == 2 {
                            path.move(to: crossings[0])
                            path.addLine(to: crossings[1])
                        } else if crossings.count == 4 {
                            let center = values.reduce(0, +) / 4
                            let pairs = (values[0] >= level) == (center >= level) ? [(0, 1), (2, 3)] : [(0, 3), (1, 2)]
                            for (start, end) in pairs {
                                path.move(to: crossings[start])
                                path.addLine(to: crossings[end])
                            }
                        }
                    }
                }
                context.stroke(path, with: .color(colorScheme == .dark ? Color(red: 0.72, green: 0.83, blue: 0.64) : contourColor(level: level)), style: StrokeStyle(lineWidth: 0.8, lineCap: .round))
            }
        }
    }
}

private let controlIndices: [[Double]] = [[1, -2, 3, -4], [9, -8, 7, -6], [5, 2, 5, -5], [-1, -3, 8, 9]]
private let controls: [[Double]] = controlIndices.map { $0.map { 2.6 * sin($0) } }

private func wave(_ position: Double, control: [Double]) -> Double {
    let angle = 2 * Double.pi * position
    return 0.5 * (control[0] * sin(angle) + control[1] * cos(angle) + control[2] * sin(2 * angle) + control[3] * cos(2 * angle))
}

private func elevation(x: Double, y: Double) -> Double {
    let sampleX = (x - 0.5) / 1.65 + 0.5
    let sampleY = (y - 0.5) / 1.65 + 0.5
    return hypot(wave(sampleX, control: controls[0]) - wave(sampleY, control: controls[2]),
                 wave(sampleX, control: controls[1]) - wave(sampleY, control: controls[3]))
}

private func smoothstep(start: Double, end: Double, value: Double) -> Double {
    let fraction = min(1, max(0, (value - start) / (end - start)))
    return fraction * fraction * (3 - 2 * fraction)
}

private func contourColor(level: Double) -> Color {
    let sageBlend = smoothstep(start: 0.2, end: 1.2, value: level)
    let limeBlend = smoothstep(start: 1.2, end: 2.3, value: level)
    let forest = [0.094, 0.235, 0.184]
    let sage = [0.408, 0.537, 0.447]
    let lime = [0.557, 0.647, 0.263]
    let rgb = (0..<3).map { channel in
        let tint = forest[channel] * (1 - sageBlend) + sage[channel] * sageBlend
        return tint * (1 - limeBlend) + lime[channel] * limeBlend
    }
    return Color(red: rgb[0], green: rgb[1], blue: rgb[2])
}

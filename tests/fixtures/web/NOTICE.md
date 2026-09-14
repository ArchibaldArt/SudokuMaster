# Internet OCR corpus

30 distinct downloaded images; SHA-256 checksums, source links, exact upstream revisions, authors, reference digits and tune/test assignments are in [corpus.json](corpus.json). Images are used only in tests and are not bundled with the website.

The selection was fixed before optimization with seed `14092026`: 11 newspaper photographs, 4 blurry photographs, 6 filled photographs, 6 generated images from François Rozet's collection, plus 3 Wikimedia examples. Initially, 20 images were used for tuning and 10 for a held-out check. The first held-out results exposed paper-texture false positives and are preserved in `docs/ocr/first-holdout.json`. Those cases were then used to improve noise suppression. Consequently, final results are a regression measurement on 30 known images, **not** an unbiased estimate on unseen images. The original tune/test assignments remain in the manifest for traceability. `empty_0139` and `empty_0140` are different photographs of the same puzzle; both were assigned to the same split.

## Sources and licenses

- `empty_*`, `blurry_*`, `filled_*`: Baptiste Wicht / Jean Hennebert, [Sudoku Dataset](https://github.com/wichtounet/sudoku_dataset), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Downloaded from François Rozet's [curated collection](https://github.com/francois-rozet/sudoku/tree/9585e73a296e8da80e886335eec31a6d4627ff26/resources/images). These upstream JPEG files are unmodified.
- `sudoku_*`: François Rozet, generated images in the same collection, MIT license reproduced below. JPEG files are unmodified.
- `airplane.jpg`: inazakira, [SUDOKU (8381070829)](<https://commons.wikimedia.org/wiki/File:SUDOKU_(8381070829).jpg>), [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/), unmodified.
- `expert.jpg`: Miraifusionzt4, [Sudoku-1.jpg](https://commons.wikimedia.org/wiki/File:Sudoku-1.jpg), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), unmodified.
- `17-clues.png`: LithiumFlash, [Sudoku Puzzle (17 clue - R929-3E01)](<https://commons.wikimedia.org/wiki/File:Sudoku_Puzzle_(17_clue_-_R929-3E01).png>), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), unmodified.

## Reference annotations

`all` is the set of visible digits; `printed` excludes handwritten entries. The Wikimedia examples were transcribed visually. Original `.dat` labels were used for the other images. `empty_` and `filled_` images with the same suffix do **not** always show the same puzzle: printed labels for `filled_0019`, `filled_0032`, `filled_0035` were transcribed directly from the photographs and checked against the visible full grid. The other filled pairs agree. These corrections apply to both baseline and final measurements; the stored baseline OCR outputs are not changed.

An additional Wikimedia newspaper photo was inspected but excluded before selection because part of its grid is outside the frame. It is not counted among the 30 images. The user-supplied blue 16×16 image and magazine photos are separate regression cases, also not counted among the 30.

No reference digits, sudoku solutions or fixture identifiers are used by the recognition algorithm. These tests adjust image processing and evaluate the existing OCR engine; they do not retrain its neural network.

## MIT License (François Rozet)

Copyright (c) 2020 François Rozet

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

# Embedded report fonts

- `NotoSans-Regular.ttf` and `NotoSans-Bold.ttf` are copied from the system Google Noto Sans package. The included Apache 2.0 license applies. They cover the Russian and Kazakh alphabets, including Ә Ғ Қ Ң Ө Ұ Ү Һ І, and the Latin scripts used by the other interface languages.
- `NotoSans-CJK-Fallback.ttf` is a static weight-400 subset of the first face of the installed `NotoSansCJK-VF.ttc`. It contains GB2312 characters plus the Chinese interface characters. The included SIL Open Font License applies. FontTools was used to subset first, then instantiate the weight axis and convert the cubic outlines to a static TrueType glyf font with FontTools Cu2QuPen. The derivative family is named BilimLens CJK Fallback. It is loaded only for Chinese text; it is not a promise of support for every historic/rare CJK character.

The PDF generator embeds subsets of the primary fonts. The already-reduced CJK fallback is embedded intact because the legacy fontkit subsetter can omit complex glyphs. A code point unsupported by both the primary and fallback font causes an explicit `PDF_FONT_UNSUPPORTED` error; it is never silently converted to a missing-glyph square.

Original source files were read from `/usr/share/fonts/google-noto/` and `/usr/share/fonts/google-noto-sans-cjk-vf-fonts/`; application runtime does not depend on these system paths.

package com.sarkaritaiyaari.backend.ingestion;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * TASK-2401 Task 5 -- a plain JUnit test (no Spring, no DB), the same shape
 * {@code TopicHealthScoringTest} already uses for pure logic. Fixtures are synthetic PDFs
 * built with PDFBox itself at test time (per Document 17's "never a real scraped
 * government document committed to a public repo") rather than binary files on disk.
 */
class PdfTextExtractorTest {

    private final PdfTextExtractor extractor = new PdfTextExtractor();

    private static byte[] pdfWithPages(List<String> pageLines) throws IOException {
        try (PDDocument document = new PDDocument()) {
            for (String line : pageLines) {
                PDPage page = new PDPage();
                document.addPage(page);
                try (PDPageContentStream stream = new PDPageContentStream(document, page)) {
                    stream.beginText();
                    stream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                    stream.newLineAtOffset(50, 700);
                    stream.showText(line);
                    stream.endText();
                }
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            return out.toByteArray();
        }
    }

    @Test
    void extract_returnsCorrectPageCountAndText() throws IOException {
        byte[] pdf = pdfWithPages(List.of(
                "This is page one of a fixture notice with plenty of real text content on it.",
                "This is page two, also with real text content, not a scanned image."));

        PdfTextExtractor.ExtractionResult result = extractor.extract(pdf);

        assertThat(result.pageCount()).isEqualTo(2);
        assertThat(result.perPageText()).hasSize(2);
        assertThat(result.perPageText().get(0)).contains("page one");
        assertThat(result.perPageText().get(1)).contains("page two");
        assertThat(result.fullText()).contains("page one").contains("page two");
    }

    @Test
    void extract_realTextContent_isFlaggedExtractable() throws IOException {
        byte[] pdf = pdfWithPages(List.of(
                "A genuinely long line of real notice text, well past the minimum characters per page threshold."));

        PdfTextExtractor.ExtractionResult result = extractor.extract(pdf);

        assertThat(result.textExtractable()).isTrue();
    }

    @Test
    void extract_pageWithNoTextAtAll_isFlaggedNotExtractable() throws IOException {
        // A page with no content stream text at all -- the same shape a scanned-image-only
        // PDF produces once PDFBox strips it (no embedded text layer to find).
        byte[] pdf;
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage());
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            pdf = out.toByteArray();
        }

        PdfTextExtractor.ExtractionResult result = extractor.extract(pdf);

        assertThat(result.pageCount()).isEqualTo(1);
        assertThat(result.textExtractable()).isFalse();
    }
}

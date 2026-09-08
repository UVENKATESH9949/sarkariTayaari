package com.sarkaritaiyaari.backend.ingestion;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/**
 * TASK-2401 Document 5/14 -- per-page text extraction using the document's existing
 * embedded text layer (no OCR -- MVP scope deliberately excludes it, per this task's own
 * architecture proposal). A document whose extracted text is negligible relative to its
 * page count is flagged {@code textExtractable = false} rather than silently guessing --
 * it's routed to manual review instead (a later task), not treated as a parsing bug.
 */
@Component
public class PdfTextExtractor {

    /** Below this average extracted characters per page, a document is treated as having
     * no usable text layer (most likely a scanned image PDF) rather than genuinely being
     * an almost-empty real document -- real SSC notices seen during this task's own
     * investigation ran to thousands of characters per page. */
    private static final int MIN_CHARS_PER_PAGE = 20;

    public record ExtractionResult(int pageCount, boolean textExtractable, String fullText, List<String> perPageText) {
    }

    public ExtractionResult extract(byte[] pdfBytes) {
        try (PDDocument document = Loader.loadPDF(pdfBytes)) {
            int pageCount = document.getNumberOfPages();
            List<String> perPage = new ArrayList<>(pageCount);
            StringBuilder full = new StringBuilder();

            PDFTextStripper stripper = new PDFTextStripper();
            for (int page = 1; page <= pageCount; page++) {
                stripper.setStartPage(page);
                stripper.setEndPage(page);
                String pageText = stripper.getText(document);
                perPage.add(pageText);
                full.append(pageText);
            }

            String fullText = full.toString();
            boolean textExtractable = pageCount > 0 && (fullText.strip().length() / (double) pageCount) >= MIN_CHARS_PER_PAGE;
            return new ExtractionResult(pageCount, textExtractable, fullText, perPage);
        } catch (IOException e) {
            throw new IllegalArgumentException("Failed to parse PDF: " + e.getMessage(), e);
        }
    }
}

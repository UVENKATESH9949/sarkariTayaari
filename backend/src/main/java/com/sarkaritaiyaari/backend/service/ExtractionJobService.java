package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.entity.ExtractionJobStatus;
import com.sarkaritaiyaari.backend.entity.ExtractionMethod;
import com.sarkaritaiyaari.backend.entity.ExtractionOperation;
import com.sarkaritaiyaari.backend.entity.IngestionDocument;
import com.sarkaritaiyaari.backend.entity.IngestionExtractionJob;
import com.sarkaritaiyaari.backend.entity.IngestionExtractionResult;
import com.sarkaritaiyaari.backend.ingestion.DetectedSection;
import com.sarkaritaiyaari.backend.ingestion.ExtractedCandidate;
import com.sarkaritaiyaari.backend.ingestion.PdfTextExtractor;
import com.sarkaritaiyaari.backend.ingestion.PdfTextExtractor.ExtractionResult;
import com.sarkaritaiyaari.backend.ingestion.RuleBasedExtractor;
import com.sarkaritaiyaari.backend.ingestion.SectionDetector;
import com.sarkaritaiyaari.backend.ingestion.ValidationEngine;
import com.sarkaritaiyaari.backend.repository.IngestionDocumentRepository;
import com.sarkaritaiyaari.backend.repository.IngestionExtractionJobRepository;
import com.sarkaritaiyaari.backend.repository.IngestionExtractionResultRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

/**
 * TASK-2401 Task 5/6/7 -- turns a stored document's bytes into per-page text, a first
 * pass of section detection, real {@code ingestion_extraction_results} candidates via
 * {@link RuleBasedExtractor}, and (Task 7) deterministic validation warnings via
 * {@link ValidationEngine} -- all tracked as one {@link IngestionExtractionJob}.
 */
@Service
public class ExtractionJobService {

    private static final Logger log = LoggerFactory.getLogger(ExtractionJobService.class);
    private static final String PARSER_VERSION = "v1";

    private final IngestionExtractionJobRepository jobRepository;
    private final IngestionExtractionResultRepository resultRepository;
    private final IngestionDocumentRepository documentRepository;
    private final PdfTextExtractor pdfTextExtractor;
    private final SectionDetector sectionDetector;
    private final RuleBasedExtractor ruleBasedExtractor;
    private final ValidationEngine validationEngine;

    public ExtractionJobService(IngestionExtractionJobRepository jobRepository,
                                 IngestionExtractionResultRepository resultRepository,
                                 IngestionDocumentRepository documentRepository,
                                 PdfTextExtractor pdfTextExtractor,
                                 SectionDetector sectionDetector,
                                 RuleBasedExtractor ruleBasedExtractor,
                                 ValidationEngine validationEngine) {
        this.jobRepository = jobRepository;
        this.resultRepository = resultRepository;
        this.documentRepository = documentRepository;
        this.pdfTextExtractor = pdfTextExtractor;
        this.sectionDetector = sectionDetector;
        this.ruleBasedExtractor = ruleBasedExtractor;
        this.validationEngine = validationEngine;
    }

    /** Runs in its own transaction (see {@link DocumentStoreService#store}'s own doc
     * comment for why this shape matters): one document's extraction failing must never
     * roll back the document row that was just successfully stored, and must never poison
     * whatever transaction the caller happens to be in. Idempotent: a document that
     * already has a job (regardless of outcome) is not reprocessed -- this is what makes
     * it safe to call unconditionally after every {@code store()}, dedup hit included. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public List<DetectedSection> processDocument(IngestionDocument document, byte[] bytes) {
        if (!jobRepository.findByDocument_Id(document.getId()).isEmpty()) {
            return List.of();
        }

        IngestionExtractionJob job = new IngestionExtractionJob();
        job.setDocument(document);
        job.setParserVersion(PARSER_VERSION);
        job.setStatus(ExtractionJobStatus.RUNNING);
        job.setStartedAt(OffsetDateTime.now());
        jobRepository.save(job);

        try {
            ExtractionResult extraction = pdfTextExtractor.extract(bytes);
            document.setPageCount(extraction.pageCount());
            document.setIsTextExtractable(extraction.textExtractable());
            documentRepository.save(document);

            List<DetectedSection> sections = extraction.textExtractable()
                    ? sectionDetector.detect(extraction.fullText())
                    : List.of();

            int fieldsExtracted = 0;
            if (extraction.textExtractable() && document.getNotice() != null) {
                List<ExtractedCandidate> candidates = ruleBasedExtractor.extract(document.getNotice(), sections);
                for (ExtractedCandidate candidate : candidates) {
                    IngestionExtractionResult result = new IngestionExtractionResult();
                    result.setExtractionJob(job);
                    result.setTargetType(candidate.targetType());
                    result.setOperation(ExtractionOperation.CREATE);
                    result.setPayload(candidate.payload());
                    result.setExtractionMethod(ExtractionMethod.RULE_BASED);
                    result.setConfidence(candidate.confidence());
                    result.setSourceExcerpt(candidate.sourceExcerpt());
                    result.setCreatedAt(OffsetDateTime.now());

                    List<String> warnings = validationEngine.validate(candidate.targetType(), candidate.payload());
                    if (!warnings.isEmpty()) {
                        result.setValidationWarnings(Map.of("messages", warnings));
                    }

                    resultRepository.save(result);
                    fieldsExtracted += candidate.payload().size();
                }
            }

            job.setStatus(ExtractionJobStatus.SUCCEEDED);
            job.setFieldsExtractedCount(fieldsExtracted);
            job.setFieldsRequiringAiCount(0);
            job.setFinishedAt(OffsetDateTime.now());
            jobRepository.save(job);
            return sections;
        } catch (RuntimeException e) {
            job.setStatus(ExtractionJobStatus.FAILED);
            job.setErrorMessage(e.getMessage());
            job.setFinishedAt(OffsetDateTime.now());
            jobRepository.save(job);
            log.warn("Extraction failed for document {}: {}", document.getId(), e.getMessage());
            return List.of();
        }
    }
}

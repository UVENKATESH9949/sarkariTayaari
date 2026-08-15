package com.sarkaritaiyaari.backend.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;

public class BulkImportRequest {

    @NotEmpty
    @Valid
    private List<BulkImportQuestionRequest> questions;

    public List<BulkImportQuestionRequest> getQuestions() {
        return questions;
    }

    public void setQuestions(List<BulkImportQuestionRequest> questions) {
        this.questions = questions;
    }
}

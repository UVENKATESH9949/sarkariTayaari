package com.sarkaritaiyaari.backend.dto;

import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * The complete set of topics an exam covers, with optional per-topic weightage. Sent whole
 * rather than as add/remove operations, exactly like {@link SyllabusRequest} — the admin
 * screen edits a list, so replacing it is what that actually means. An empty list clears
 * the mapping.
 */
public class ExamTopicsRequest {

    @NotNull
    private List<Entry> topics;

    public List<Entry> getTopics() {
        return topics;
    }

    public void setTopics(List<Entry> topics) {
        this.topics = topics;
    }

    public static class Entry {

        @NotNull
        private UUID topicId;

        /** Optional. Null means "relevant to this exam, weightage not assessed". */
        private BigDecimal weightagePercent;

        public UUID getTopicId() {
            return topicId;
        }

        public void setTopicId(UUID topicId) {
            this.topicId = topicId;
        }

        public BigDecimal getWeightagePercent() {
            return weightagePercent;
        }

        public void setWeightagePercent(BigDecimal weightagePercent) {
            this.weightagePercent = weightagePercent;
        }
    }
}

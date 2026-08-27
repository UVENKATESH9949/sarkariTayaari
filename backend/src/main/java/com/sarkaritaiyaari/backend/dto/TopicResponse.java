package com.sarkaritaiyaari.backend.dto;

import java.util.List;
import java.util.UUID;

public class TopicResponse {

    private UUID id;
    private UUID subjectId;
    private String subjectName;
    private String name;
    private int displayOrder;
    /** Null for a top-level topic. */
    private UUID parentId;
    /** Null for a top-level topic — carried so a client can render a breadcrumb without a second call. */
    private String parentName;
    private List<UUID> prerequisiteTopicIds;

    public TopicResponse() {
    }

    public TopicResponse(UUID id, UUID subjectId, String subjectName, String name, int displayOrder,
                         UUID parentId, String parentName, List<UUID> prerequisiteTopicIds) {
        this.id = id;
        this.subjectId = subjectId;
        this.subjectName = subjectName;
        this.name = name;
        this.displayOrder = displayOrder;
        this.parentId = parentId;
        this.parentName = parentName;
        this.prerequisiteTopicIds = prerequisiteTopicIds;
    }

    public UUID getParentId() {
        return parentId;
    }

    public void setParentId(UUID parentId) {
        this.parentId = parentId;
    }

    public String getParentName() {
        return parentName;
    }

    public void setParentName(String parentName) {
        this.parentName = parentName;
    }

    public List<UUID> getPrerequisiteTopicIds() {
        return prerequisiteTopicIds;
    }

    public void setPrerequisiteTopicIds(List<UUID> prerequisiteTopicIds) {
        this.prerequisiteTopicIds = prerequisiteTopicIds;
    }

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public UUID getSubjectId() {
        return subjectId;
    }

    public void setSubjectId(UUID subjectId) {
        this.subjectId = subjectId;
    }

    public String getSubjectName() {
        return subjectName;
    }

    public void setSubjectName(String subjectName) {
        this.subjectName = subjectName;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public int getDisplayOrder() {
        return displayOrder;
    }

    public void setDisplayOrder(int displayOrder) {
        this.displayOrder = displayOrder;
    }
}

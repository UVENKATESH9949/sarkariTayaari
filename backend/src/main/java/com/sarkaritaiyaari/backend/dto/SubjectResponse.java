package com.sarkaritaiyaari.backend.dto;

import java.util.List;
import java.util.UUID;

public class SubjectResponse {

    private UUID id;
    private String name;
    private int displayOrder;
    private String icon;
    private String color;
    private String colorBg;
    /** Exams whose syllabus covers this subject — one subject can belong to many. */
    private List<String> examCodes = List.of();

    public SubjectResponse() {
    }

    public SubjectResponse(UUID id, String name, int displayOrder, String icon, String color, String colorBg,
                           List<String> examCodes) {
        this.id = id;
        this.name = name;
        this.displayOrder = displayOrder;
        this.icon = icon;
        this.color = color;
        this.colorBg = colorBg;
        this.examCodes = examCodes;
    }

    public List<String> getExamCodes() {
        return examCodes;
    }

    public void setExamCodes(List<String> examCodes) {
        this.examCodes = examCodes;
    }

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
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

    public String getIcon() {
        return icon;
    }

    public void setIcon(String icon) {
        this.icon = icon;
    }

    public String getColor() {
        return color;
    }

    public void setColor(String color) {
        this.color = color;
    }

    public String getColorBg() {
        return colorBg;
    }

    public void setColorBg(String colorBg) {
        this.colorBg = colorBg;
    }
}

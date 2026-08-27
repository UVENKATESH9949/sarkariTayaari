package com.sarkaritaiyaari.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * The editorial tag shown on an exam card ("Trending", "Popular"). A real table rather
 * than an enum for the same reason difficulty_levels is one: the vocabulary and its
 * colours are curated content, so adding a tag is data, not a release. Deliberately has
 * no icon — the design renders these as text-only pills.
 */
@Entity
@Table(name = "exam_badges")
public class ExamBadge {

    @Id
    private String code;

    @Column(nullable = false)
    private String label;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    private String color;

    @Column(name = "color_bg")
    private String colorBg;

    @Column(name = "is_active", nullable = false)
    private boolean active;

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    public int getDisplayOrder() {
        return displayOrder;
    }

    public void setDisplayOrder(int displayOrder) {
        this.displayOrder = displayOrder;
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

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }
}

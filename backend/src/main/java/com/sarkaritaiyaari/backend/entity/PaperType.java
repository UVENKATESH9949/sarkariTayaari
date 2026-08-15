package com.sarkaritaiyaari.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Whether a paper can be mock-tested at all. UPSC Mains is nine descriptive papers —
 * the app shows that structure but must not try to generate an MCQ test from it.
 */
@Entity
@Table(name = "paper_types")
public class PaperType {

    @Id
    private String code;

    @Column(nullable = false)
    private String label;

    @Column(name = "is_mockable", nullable = false)
    private boolean mockable;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

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

    public boolean isMockable() {
        return mockable;
    }

    public void setMockable(boolean mockable) {
        this.mockable = mockable;
    }

    public int getDisplayOrder() {
        return displayOrder;
    }

    public void setDisplayOrder(int displayOrder) {
        this.displayOrder = displayOrder;
    }
}

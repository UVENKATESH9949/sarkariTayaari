package com.sarkaritaiyaari.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "topics", uniqueConstraints = @UniqueConstraint(columnNames = {"subject_id", "name"}))
public class Topic {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "subject_id", nullable = false)
    private Subject subject;

    @Column(nullable = false)
    private String name;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    /**
     * Self-reference giving the topic tree variable depth — null means top level.
     * Chosen over separate Chapter/SubTopic/Concept tables because depth genuinely
     * differs per subject; see V12's own comment for the full reasoning.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_id")
    private Topic parent;

    /**
     * Topics that should be studied before this one. A directed graph, not a tree — a
     * topic can have several prerequisites and be a prerequisite for several others.
     * Owned from this side so the admin edits "what does this topic need".
     */
    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
            name = "topic_prerequisites",
            joinColumns = @JoinColumn(name = "topic_id"),
            inverseJoinColumns = @JoinColumn(name = "prerequisite_topic_id")
    )
    private Set<Topic> prerequisites = new LinkedHashSet<>();

    public UUID getId() {
        return id;
    }

    public Topic getParent() {
        return parent;
    }

    public void setParent(Topic parent) {
        this.parent = parent;
    }

    public Set<Topic> getPrerequisites() {
        return prerequisites;
    }

    public void setPrerequisites(Set<Topic> prerequisites) {
        this.prerequisites = prerequisites;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public Subject getSubject() {
        return subject;
    }

    public void setSubject(Subject subject) {
        this.subject = subject;
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

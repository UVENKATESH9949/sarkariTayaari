package com.sarkaritaiyaari.backend.entity;

/** Spec §11's own example row ("Category Certificate | If applicable") needs a third
 * state beyond required/not-required, which is the whole reason this isn't a boolean. */
public enum DocumentRequirementLevel {
    YES,
    NO,
    IF_APPLICABLE,
}

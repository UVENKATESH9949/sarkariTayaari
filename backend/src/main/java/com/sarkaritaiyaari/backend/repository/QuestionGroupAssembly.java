package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.Question;
import com.sarkaritaiyaari.backend.entity.QuestionGroup;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;

/**
 * The group-aware Mock Test assembly algorithm (TASK-2301 Phase P3) — a standalone question is
 * an atomic unit of size 1; a question belonging to a {@link QuestionGroup} pulls in every
 * (non-deleted) sibling in that group as one atomic unit, so a passage is never split across a
 * section. A pure function over plain lists (no repository/entity-manager dependency) so it can
 * be unit-tested directly, mirrored line-for-line by {@code mobile/src/db/mockTest.ts}'s
 * TypeScript equivalent — the same "two copies, kept honest by shared test cases" pattern this
 * codebase already uses for the evaluator registry.
 *
 * <p>{@code candidates} is expected to already be in a random order (this project's callers
 * source it via {@code ORDER BY random()} at the DB level) — the units built from it are
 * reshuffled once more here anyway, so a unit's chance of inclusion doesn't depend on how many of
 * its members happened to appear early in that source order.
 *
 * <p>Greedy, not exhaustive: a unit that would overflow the remaining quota is skipped, not
 * split and not deferred for a better fit later — the same "may undershoot the requested count"
 * trade-off ADR-008 already accepts for the ungrouped case, now extended to the grouped one.
 */
public final class QuestionGroupAssembly {

    private QuestionGroupAssembly() {
    }

    /**
     * @param candidates       eligible questions already matching the section's exam/subject/pool
     *                         filter, in a random order. Some may share a {@link QuestionGroup} —
     *                         each distinct group is expanded to its *full* sibling set via
     *                         {@code groupChildrenLoader}, once, regardless of how many of that
     *                         group's children happened to individually match the filter.
     * @param limit            the section's remaining question quota. Never exceeded.
     * @param groupChildrenLoader loads every non-deleted child of a group, in {@code groupOrder}.
     */
    public static List<Question> packRandomSample(List<Question> candidates, int limit,
                                                    Function<UUID, List<Question>> groupChildrenLoader) {
        List<List<Question>> units = new ArrayList<>();
        Set<UUID> seenGroupIds = new HashSet<>();
        for (Question q : candidates) {
            QuestionGroup group = q.getQuestionGroup();
            if (group == null) {
                units.add(List.of(q));
            } else if (seenGroupIds.add(group.getId())) {
                units.add(groupChildrenLoader.apply(group.getId()));
            }
        }

        Collections.shuffle(units);

        List<Question> result = new ArrayList<>();
        for (List<Question> unit : units) {
            if (result.size() + unit.size() > limit) {
                continue;
            }
            result.addAll(unit);
            if (result.size() >= limit) {
                break;
            }
        }
        return result;
    }
}

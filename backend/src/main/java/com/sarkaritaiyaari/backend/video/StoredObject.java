package com.sarkaritaiyaari.backend.video;

/**
 * What a store knows about a file once it has taken it.
 *
 * <p>{@code store} used to return just the key. It returns this instead because the object store
 * already measures the video while ingesting it, and throwing that away meant duration had to be
 * typed in by hand on the upload form - a number that is then wrong whenever someone mistypes it,
 * with nothing to catch the mistake. Anything the store does not know is null; a caller keeps what
 * it already had rather than overwriting a real value with a blank.
 *
 * @param key             the key to persist on the row - authoritative, since a store may have
 *                        adjusted the one it was handed
 * @param durationSeconds video length as the store measured it, or null
 * @param width           pixel width as the store measured it, or null
 * @param height          pixel height as the store measured it, or null
 */
public record StoredObject(String key, Integer durationSeconds, Integer width, Integer height) {

    /** For a store that takes bytes without inspecting them. */
    public static StoredObject of(String key) {
        return new StoredObject(key, null, null, null);
    }
}

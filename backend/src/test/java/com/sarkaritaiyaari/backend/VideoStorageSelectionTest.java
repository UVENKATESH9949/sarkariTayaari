package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.video.CloudinaryVideoStorage;
import com.sarkaritaiyaari.backend.video.VideoStorage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Proves the storage switch actually wires.
 *
 * <p>Worth its own context start, because the failure it guards against is silent and total: two
 * implementations of one interface behind {@code @ConditionalOnProperty} means a typo in either
 * condition gives you zero beans (the whole application refuses to start) or two (an ambiguous
 * dependency). Neither shows up in a compile, and the first would surface in production as a
 * deploy that never comes up.
 *
 * <p>The local default is already proven by every other test in this module running against it.
 * This asserts the other half - that setting the provider to cloudinary genuinely swaps the
 * implementation, without needing real Cloudinary credentials to find out.
 */
@SpringBootTest
@TestPropertySource(properties = "app.video-storage.provider=cloudinary")
class VideoStorageSelectionTest {

    @Autowired
    private VideoStorage videoStorage;

    @Test
    @DisplayName("setting the provider to cloudinary swaps the implementation")
    void cloudinaryProviderIsSelected() {
        assertThat(videoStorage).isInstanceOf(CloudinaryVideoStorage.class);
    }

    @Test
    @DisplayName("the Cloudinary store serves no bytes itself, so playback must use its URL")
    void cloudinaryServesNoBytesDirectly() {
        // If this ever returned a Resource, the backend would start proxying an object store -
        // the exact cost the deliveryUrl path exists to avoid.
        assertThat(videoStorage.open("lesson-videos/anything/v1.mp4")).isEmpty();
    }
}

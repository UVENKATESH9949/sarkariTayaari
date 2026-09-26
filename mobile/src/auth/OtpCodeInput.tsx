import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { radius, spacing } from "../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../ui/ThemeContext";

export const OTP_LENGTH = 6;

export type OtpCodeInputHandle = { focus: () => void; clear: () => void };

type Props = {
  value: string;
  onChange: (digits: string) => void;
  /** Fired once when the sixth digit arrives — by typing, pasting or autofill alike. */
  onComplete?: (digits: string) => void;
  error?: boolean;
  disabled?: boolean;
};

/**
 * Six boxes on screen, ONE real text field underneath.
 *
 * <h2>Why one field and not six</h2>
 * Six separate inputs is the obvious build and it breaks the three things a code field most needs:
 * a pasted "482913" lands in the first box only, OS code suggestions (iOS offers codes it finds in
 * Mail) fill one box, and backspace has to be re-implemented box by box. A single field gets all
 * three from the platform for free — typing auto-advances because the text simply grows, backspace
 * deletes the last digit, and a paste or autofill of six digits fills every box at once.
 *
 * The field is laid exactly over the boxes and made invisible (transparent text, hidden caret) but
 * NOT hidden, so a long-press on the boxes still opens the platform's own Paste menu. The boxes are
 * only a picture of the field's value.
 *
 * <h2>Clipboard</h2>
 * The clipboard is never read by this component. Pasting happens only through the platform's
 * paste action, which the student triggers themselves.
 */
export const OtpCodeInput = forwardRef<OtpCodeInputHandle, Props>(function OtpCodeInput(
  { value, onChange, onComplete, error, disabled },
  ref,
) {
  const styles = useThemedStyles(buildStyles);
  const { colors } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    clear: () => onChange(""),
  }));

  const handleChange = (text: string) => {
    // Accepts "482 913", "482-913" or a whole pasted sentence: keep the digits, first six only.
    const digits = text.replace(/\D/g, "").slice(0, OTP_LENGTH);
    onChange(digits);
    if (digits.length === OTP_LENGTH && digits !== value) onComplete?.(digits);
  };

  const activeIndex = Math.min(value.length, OTP_LENGTH - 1);

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      accessible={false}
      // Only the text field inside may take focus. Found on the emulator: when focus left the
      // field after a submit, it landed on this wrapper, and Android painted its default grey
      // focus highlight as a strip behind all six boxes.
      focusable={false}
      style={styles.wrap}
    >
      <View style={styles.row} pointerEvents="none">
        {Array.from({ length: OTP_LENGTH }, (_, i) => {
          const digit = value[i] ?? "";
          const isActive = focused && !disabled && i === activeIndex && value.length < OTP_LENGTH;
          return (
            <View
              key={i}
              style={[
                styles.box,
                digit !== "" && styles.boxFilled,
                isActive && styles.boxActive,
                error && styles.boxError,
                disabled && styles.boxDisabled,
              ]}
            >
              <Text style={styles.digit}>{digit}</Text>
              {isActive ? <View style={[styles.caret, { backgroundColor: colors.brand.primary }]} /> : null}
            </View>
          );
        })}
      </View>

      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editable={!disabled}
        keyboardType="number-pad"
        inputMode="numeric"
        // iOS: offer codes it has found in Mail/Messages. Android: the platform's one-time-code hint.
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === "android" ? "sms-otp" : "one-time-code"}
        maxLength={OTP_LENGTH + 8 /* room for a pasted "482 913" before it is cleaned */}
        autoFocus
        caretHidden
        contextMenuHidden={false}
        selectionColor="transparent"
        style={styles.hiddenInput}
        accessibilityLabel="6-digit verification code"
        accessibilityHint="Type or paste the code from your email"
        importantForAutofill="yes"
        underlineColorAndroid="transparent"
      />
    </Pressable>
  );
});

function buildStyles({ colors }: Theme) {
  return StyleSheet.create({
    wrap: {
      position: "relative",
    },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    box: {
      flex: 1,
      aspectRatio: 0.86,
      maxHeight: 64,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surfaceElevated,
      alignItems: "center",
      justifyContent: "center",
    },
    boxFilled: {
      borderColor: colors.text.muted,
    },
    boxActive: {
      borderColor: colors.brand.primary,
      backgroundColor: colors.brand.glowSoft,
    },
    boxError: {
      borderColor: colors.semantic.error,
      backgroundColor: colors.semantic.errorBg,
    },
    boxDisabled: {
      opacity: 0.6,
    },
    digit: {
      fontSize: 24,
      fontWeight: "700",
      color: colors.text.primary,
    },
    caret: {
      position: "absolute",
      width: 2,
      height: 24,
      borderRadius: 1,
    },
    hiddenInput: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      // Invisible but present: it must still receive taps and long-press (for Paste).
      color: "transparent",
      backgroundColor: "transparent",
      fontSize: 1,
      // Near-zero, not zero: a fully transparent view can stop receiving touches on some Android
      // versions. At 1 (the first version) the emulator showed the field's own grey background as a
      // strip behind the boxes and a speck of its 1px text in the first box.
      opacity: 0.011,
    },
  });
}

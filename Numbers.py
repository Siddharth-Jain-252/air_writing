import mediapipe as mp
import cv2
import numpy as np
import time
import os

# ── MediaPipe setup ──────────────────────────────────────────────────────────
mp_hands = mp.solutions.hands
hands = mp_hands.Hands(max_num_hands=1, min_detection_confidence=0.7)

# ── State ────────────────────────────────────────────────────────────────────
canvas = None          # grayscale drawing canvas (single channel)
prev_x, prev_y = 0, 0

cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FPS, 60)


# ── Helpers ──────────────────────────────────────────────────────────────────

def deskew(img: np.ndarray, size: int = 28) -> np.ndarray:
    """Deskew digit using second-order moments (same as MNIST pipeline)."""
    m = cv2.moments(img)
    if abs(m["mu02"]) < 1e-2:
        return img
    skew = m["mu11"] / m["mu02"]
    M = np.float32([[1, skew, -0.5 * size * skew], [0, 1, 0]])
    return cv2.warpAffine(
        img, M, (size, size),
        flags=cv2.WARP_INVERSE_MAP | cv2.INTER_LINEAR
    )


def preprocess_drawing(canvas_gray: np.ndarray) -> np.ndarray | None:
    """
    Convert a raw grayscale canvas into a 28×28 MNIST-style image.

    Pipeline:
      1. Threshold → binary mask
      2. Find bounding box of drawn pixels
      3. Crop & aspect-ratio-preserving resize to 20×20
      4. Center in 28×28 canvas
      5. Center-of-mass shift (intensity-weighted)
      6. Deskew
      7. Gaussian blur (soft edges like MNIST)
      8. Intensity normalisation (peak → 255)
    """
    # 1. Threshold
    _, thresh = cv2.threshold(canvas_gray, 50, 255, cv2.THRESH_BINARY)

    # 2. Bounding box
    coords = np.column_stack(np.where(thresh > 0))
    if coords.size == 0:
        return None

    y_min, x_min = coords.min(axis=0)
    y_max, x_max = coords.max(axis=0)
    digit_crop = thresh[y_min:y_max + 1, x_min:x_max + 1]

    # 3. Aspect-ratio-preserving resize to 20×20
    h_box, w_box = digit_crop.shape
    scale = 20.0 / max(h_box, w_box)
    new_w = max(1, int(w_box * scale))
    new_h = max(1, int(h_box * scale))
    digit_resized = cv2.resize(digit_crop, (new_w, new_h), interpolation=cv2.INTER_AREA)

    # 4. Center in 28×28
    padded = np.zeros((28, 28), dtype=np.uint8)
    y_off = (28 - new_h) // 2
    x_off = (28 - new_w) // 2
    padded[y_off:y_off + new_h, x_off:x_off + new_w] = digit_resized

    # 5. Center-of-mass (intensity-weighted) shift
    moments = cv2.moments(padded)
    if moments["m00"] != 0:
        cx = int(moments["m10"] / moments["m00"])
        cy = int(moments["m01"] / moments["m00"])
        shift_x = 14 - cx
        shift_y = 14 - cy
        M = np.float32([[1, 0, shift_x], [0, 1, shift_y]])
        padded = cv2.warpAffine(padded, M, (28, 28))

    # 6. Deskew
    padded = deskew(padded)

    # 7. Gaussian blur (soft edges matching MNIST scanner blur)
    padded = cv2.GaussianBlur(padded, (3, 3), 0)

    # 8. Intensity normalisation
    if padded.max() > 0:
        padded = (padded.astype(np.float32) / padded.max() * 255).astype(np.uint8)

    return padded


# ── Main loop ────────────────────────────────────────────────────────────────
while True:
    success, frame = cap.read()
    if not success:
        break

    frame = cv2.flip(frame, 1)
    h, w, _ = frame.shape

    # Initialise canvas as single-channel grayscale
    if canvas is None:
        canvas = np.zeros((h, w), dtype=np.uint8)

    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    result = hands.process(rgb_frame)

    if result.multi_hand_landmarks:
        for hand_landmarks in result.multi_hand_landmarks:

            # Index fingertip (landmark 8)
            x = int(hand_landmarks.landmark[8].x * w)
            y = int(hand_landmarks.landmark[8].y * h)

            # Middle fingertip (landmark 12) — used as mode switch
            mx = int(hand_landmarks.landmark[12].x * w)
            my = int(hand_landmarks.landmark[12].y * h)

            # Draw mode: index tip above middle tip
            if y < my:
                cv2.circle(frame, (x, y), 10, (0, 255, 255), -1)

                if prev_x == 0 and prev_y == 0:
                    prev_x, prev_y = x, y

                # Thinner strokes → more MNIST-like (8 px)
                cv2.line(canvas, (prev_x, prev_y), (x, y), 255, 8)

                prev_x, prev_y = x, y
            else:
                # Lift pen
                prev_x, prev_y = 0, 0

    # Show canvas as BGR for imshow compatibility
    canvas_bgr = cv2.cvtColor(canvas, cv2.COLOR_GRAY2BGR)
    cv2.imshow("Camera Feed", frame)
    cv2.imshow("Drawing Canvas", canvas_bgr)

    key = cv2.waitKey(1)

    if key == -1:
        continue

    elif key == 27:          # ESC → quit
        break

    elif key == ord('c'):    # c → clear canvas
        canvas = np.zeros((h, w), dtype=np.uint8)
        print("Canvas cleared.")

    elif chr(key).isdigit(): # 0-9 → save with label
        label = chr(key)
        final_img = preprocess_drawing(canvas)

        if final_img is None:
            print("Empty drawing — nothing saved.")
            continue

        save_dir = f"dataset/{label}"
        os.makedirs(save_dir, exist_ok=True)
        filepath = f"{save_dir}/drawing_{int(time.time())}.png"
        cv2.imwrite(filepath, final_img)
        print(f"Saved: {filepath}")

        # Show a quick preview of what was saved
        preview = cv2.resize(final_img, (280, 280), interpolation=cv2.INTER_NEAREST)
        cv2.imshow("Saved Preview (28x28 upscaled)", preview)

cap.release()
cv2.destroyAllWindows()
import mediapipe as mp
import cv2
import numpy as np
import time

mp_hands = mp.solutions.hands
hands = mp_hands.Hands(max_num_hands=1, min_detection_confidence=0.7)

canvas = None

prev_x, prev_y = 0, 0

cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FPS, 60)

while True:
    success, frame = cap.read()
    if not success:
        break

    frame = cv2.flip(frame, 1)

    if canvas is None:
        canvas = np.zeros_like(frame)

    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    result = hands.process(rgb_frame)

    if result.multi_hand_landmarks:
        for hand_landmarks in result.multi_hand_landmarks:

            h, w, _ = frame.shape

            x = int(hand_landmarks.landmark[8].x * w)
            y = int(hand_landmarks.landmark[8].y * h)

            mx = int(hand_landmarks.landmark[12].x * w)
            my = int(hand_landmarks.landmark[12].y * h)

            if y < my:
                cv2.circle(frame, (x,y), 10, (0,255,255), -1)

                if prev_x == 0 and prev_y == 0:
                    prev_x, prev_y = x, y

                cv2.line(canvas, (prev_x, prev_y), (x, y), (255, 255, 255),30)

                prev_x, prev_y = x, y

            else:
                prev_x, prev_y = 0, 0

    
    cv2.imshow("Camera Feed", frame)
    cv2.imshow("Drawing Canvas", canvas)

    key = cv2.waitKey(1)

    if key == -1:
        continue
    elif key == 27:
        break
    elif key == ord('c'):
        canvas = np.zeros_like(frame)
    elif chr(key).isdigit():
        filepath = f"dataset/{chr(key)}/drawing_{int(time.time())}.png" 
        gray = cv2.cvtColor(canvas, cv2.COLOR_BGR2GRAY) 
        new_canvas = cv2.resize(gray, (56, 56)) 
        cv2.imwrite(filepath, new_canvas) 
        canvas = np.zeros_like(frame)

cap.release()
cv2.destroyAllWindows()
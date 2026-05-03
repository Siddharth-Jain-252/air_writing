from fastapi import FastAPI
import tensorflow as tf
import numpy as np
import base64
from PIL import Image
import cv2
from io import BytesIO
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

class ImageRequest(BaseModel):
    image: str

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model = tf.keras.models.load_model("./mnist.h5")

def decode_image(data_url: str) -> np.ndarray:
    
    header, encoded = data_url.split(",", 1)
    img_bytes = base64.b64decode(encoded)
    pil_img = Image.open(BytesIO(img_bytes)).convert("RGBA")
    rgba = np.array(pil_img, dtype=np.uint8)         

    # Use alpha as stroke mask

    alpha = rgba[:, :, 3]  # (480, 640)

    # Binarise
    _, binary = cv2.threshold(alpha, 10, 255, cv2.THRESH_BINARY)

    # Bounding box + aspect-ratio-preserving resize to 20×20
    coords = np.column_stack(np.where(binary > 0))   
    if coords.size == 0:
        return None                                

    y_min, x_min = coords.min(axis=0)
    y_max, x_max = coords.max(axis=0)
    crop = binary[y_min:y_max + 1, x_min:x_max + 1]

    h_box, w_box = crop.shape
    scale = 20.0 / max(h_box, w_box)
    new_w = max(1, int(w_box * scale))
    new_h = max(1, int(h_box * scale))
    resized = cv2.resize(crop, (new_w, new_h), interpolation=cv2.INTER_AREA)

    #  Center in 28×28
    padded = np.zeros((28, 28), dtype=np.uint8)
    y_off = (28 - new_h) // 2
    x_off = (28 - new_w) // 2
    padded[y_off:y_off + new_h, x_off:x_off + new_w] = resized

    # Intensity-weighted center-of-mass shift 
    m = cv2.moments(padded)
    if m["m00"] != 0:
        cx = int(m["m10"] / m["m00"])
        cy = int(m["m01"] / m["m00"])
        shift_x = 14 - cx
        shift_y = 14 - cy
        M = np.float32([[1, 0, shift_x], [0, 1, shift_y]])
        padded = cv2.warpAffine(padded, M, (28, 28))

    # Deskew 
    m2 = cv2.moments(padded)
    if abs(m2["mu02"]) >= 1e-2:
        skew = m2["mu11"] / m2["mu02"]
        M = np.float32([[1, skew, -0.5 * 28 * skew], [0, 1, 0]])
        padded = cv2.warpAffine(
            padded, M, (28, 28),
            flags=cv2.WARP_INVERSE_MAP | cv2.INTER_LINEAR
        )

    # Gaussian blur 
    padded = cv2.GaussianBlur(padded, (3, 3), 0)

    # Intensity normalisation
    if padded.max() > 0:
        padded = (padded.astype(np.float32) / padded.max() * 255).astype(np.uint8)

    return padded

@app.get("/")
def home():
    return {"message": "API is running"}

@app.post("/predict")
def predict(data: ImageRequest):
    # Convert input to numpy
    arr = np.array(decode_image(data.image))/255.0
    
    arr = arr.reshape(1, 28, 28, 1)

    prediction = model.predict(arr)
    result = int(np.argmax(prediction))

    return {"prediction": result}
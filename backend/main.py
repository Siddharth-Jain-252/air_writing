from fastapi import FastAPI
import tensorflow as tf
import numpy as np
import base64
from PIL import Image
import io
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

model = tf.keras.models.load_model("./model.h5")

def decode_image(base64_str):
    base64_str = base64_str.split(",")[1]
    img_bytes = base64.b64decode(base64_str)
    img = Image.open(io.BytesIO(img_bytes)).convert("L")

    img = np.array(img)

    # Threshold
    img = (img > 50).astype(np.uint8) * 255

    # Crop bounding box
    coords = np.column_stack(np.where(img > 0))
    if coords.size != 0:
        y_min, x_min = coords.min(axis=0)
        y_max, x_max = coords.max(axis=0)
        img = img[y_min:y_max, x_min:x_max]

    # Resize
    img = Image.fromarray(img).resize((32, 32))
    return img

@app.get("/")
def home():
    return {"message": "API is running"}

@app.post("/predict")
def predict(data: ImageRequest):
    # Convert input to numpy
    arr = np.array(decode_image(data.image))/255.0
    
    arr = arr.reshape(1, 32, 32, 1)

    prediction = model.predict(arr)
    result = int(np.argmax(prediction))

    return {"prediction": result}
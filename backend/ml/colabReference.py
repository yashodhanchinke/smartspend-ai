# -*- coding: utf-8 -*-
"""
SmartSpend AI - Model Training Google Colab Pipeline
This script represents the cell-by-cell offline training code for:
1. Multinomial Naive Bayes (SMS Category Classification)
2. Polynomial Regression (Expense Forecasting)
3. Tesseract OCR (Image Preprocessing & OCR Bounding Box Extraction)
"""

# =====================================================================
# CELL 1: Install & Import Dependencies
# =====================================================================
# !pip install numpy pandas scikit-learn matplotlib seaborn pytesseract
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score

print("Dependencies loaded successfully.")

# =====================================================================
# CELL 2: Part 1 - Multinomial Naive Bayes SMS Dataset & Training
# =====================================================================
# Generate synthetic Indian banking transaction SMS templates for training
sms_data = [
    # Food
    ("debited rs. 320 to swiggy on hdfc card", "food"),
    ("paid rs 150 for cafe coffee day tea", "food"),
    ("zomato txn of rs 450 completed", "food"),
    ("hotel dhaba charge inr 1200", "food"),
    # Groceries
    ("blinkit order for rs. 640 delivered", "groceries"),
    ("zepto groceries order debited rs 890", "groceries"),
    ("supermarket bill rs 1250 at reliance fresh", "groceries"),
    ("paid rs 350 to local kirana general store", "groceries"),
    # Shopping
    ("amazon order rs. 1850 received", "shopping"),
    ("myntra fashion apparel debited inr 2400", "shopping"),
    ("flipkart purchase rs. 3999 at shop", "shopping"),
    ("store payment of rs 1200 at lifestyle", "shopping"),
    # Transport
    ("uber cab ride debited rs. 280", "transport"),
    ("ola auto paid rs. 95 using upi", "transport"),
    ("petrol pump fuel refill rs 1500 done", "transport"),
    ("fastag recharge of rs 500 successful", "transport"),
    # Bills
    ("recharge of rs. 299 for jio postpaid done", "bills"),
    ("electricity bill rs. 2450 paid to bsese", "bills"),
    ("broadband wifi bill payment rs. 799", "bills"),
    ("insurance premium of rs 4500 debited", "bills"),
    # Salary (Income)
    ("salary of rs. 48000 credited to account", "salary"),
    ("payroll credit inr 52000 from client", "salary"),
    ("wages rs 25000 deposited in bank", "salary"),
    ("salary credited by employer rs 35000", "salary"),
    # Cashback (Income)
    ("cashback of rs. 50 received on paytm", "cashback"),
    ("refund of rs 1200 credited for order", "cashback"),
    ("reward points cashback rs 75 added", "cashback"),
    ("credited rs 150 reward cashback bonus", "cashback")
]

# Duplicate data with small perturbations to build a larger realistic dataset (1000 items)
np.random.seed(42)
dataset = []
categories = ["food", "groceries", "shopping", "transport", "bills", "salary", "cashback"]
for _ in range(1000):
    base_sms, cat = sms_data[np.random.randint(len(sms_data))]
    # Perturb amounts slightly
    amt = np.random.randint(50, 6000)
    new_sms = base_sms.replace("320", str(amt)).replace("150", str(amt)).replace("450", str(amt)).replace("1200", str(amt))
    dataset.append((new_sms, cat))

df = pd.DataFrame(dataset, columns=["text", "label"])

# Vectorize using Bag of Words count features
vectorizer = CountVectorizer(stop_words='english')
X = vectorizer.fit_transform(df["text"])
y = df["label"]

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Train Multinomial Naive Bayes classifier with Laplace smoothing alpha=1.0
nb_classifier = MultinomialNB(alpha=1.0)
nb_classifier.fit(X_train, y_train)

# Evaluation
y_pred = nb_classifier.predict(X_test)
accuracy = accuracy_score(y_test, y_pred)
print(f"Overall Test Accuracy: {accuracy * 100:.2f}%")
print("\nClassification Report:\n", classification_report(y_test, y_pred))

# Plot Confusion Matrix
cm = confusion_matrix(y_test, y_pred)
plt.figure(figsize=(8, 6))
sns.heatmap(cm, annot=True, fmt='d', xticklabels=categories, yticklabels=categories, cmap='Blues')
plt.title('SMS Classification Confusion Matrix (Multinomial Naive Bayes)')
plt.ylabel('True Class')
plt.xlabel('Predicted Class')
plt.savefig('nb_confusion_matrix.png')
print("Confusion Matrix saved as 'nb_confusion_matrix.png'")

# =====================================================================
# CELL 3: Part 2 - Polynomial Regression Expense Forecasting
# =====================================================================
# Fit Indian household expenses over 6 months to predict next month (Degree 2)
# Inputs: Monthly Index (0: Jan, 1: Feb, etc.), Output: Expenses (INR)
months = np.array([0, 1, 2, 3, 4, 5]).reshape(-1, 1)
expenses = np.array([12500, 14200, 13800, 16500, 15900, 18200]) # Salary: 45000 INR

# Fit Polynomial features of degree 2
# Equation: y = w0 + w1*x + w2*x^2
X_poly = np.hstack([np.ones((len(months), 1)), months, months**2])

# Solve Normal Equation: w = (X_T * X)^-1 * X_T * y
X_T = X_poly.T
w = np.linalg.inv(X_T.dot(X_poly)).dot(X_T).dot(expenses)

print(f"Polynomial Coefficients -> w0 (intercept) = {w[0]:.2f}, w1 (linear) = {w[1]:.2f}, w2 (quadratic) = {w[2]:.2f}")

# Predict next month (Index 6)
next_month = 6
forecast = w[0] + w[1] * next_month + w[2] * (next_month**2)
print(f"Forecasted Expense for Month Index {next_month}: Rs. {forecast:.2f}")

# Calculate R2 Score
predictions = X_poly.dot(w)
mean_y = np.mean(expenses)
tss = np.sum((expenses - mean_y)**2)
rss = np.sum((expenses - predictions)**2)
r2 = 1 - (rss / tss)
print(f"R-squared Score (Accuracy of Curve Fit): {r2:.4f}")

# =====================================================================
# CELL 4: Part 3 - Tesseract OCR Simulation Pipeline
# =====================================================================
# Layout analysis and binarization logic for receipt scanning
# In Google Colab, we run:
# !apt-get install tesseract-ocr
# !apt-get install libtesseract-dev

import cv2

def preprocess_image_for_tesseract(image_path):
    # 1. Read image in Grayscale
    img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    
    # 2. Apply Gaussian Blur to denoise
    blurred = cv2.GaussianBlur(img, (5, 5), 0)
    
    # 3. Apply Otsu's Adaptive Thresholding (Binarization)
    _, binarized = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    
    # 4. Deskew image using minAreaRect
    coords = np.column_stack(np.where(binarized > 0))
    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45:
        angle = -(90 + angle)
    else:
        angle = -angle
        
    (h, w) = img.shape[:2]
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    deskewed = cv2.warpAffine(binarized, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_RECLAIM)
    
    return deskewed

# import pytesseract
# text = pytesseract.image_to_string(preprocess_image_for_tesseract('receipt.png'))
# print("Extracted OCR Text:\n", text)
print("OCR Preprocessing Pipeline defined.")


# Predictive Stock/ETF Model

## Overview
This repository contains a Python-based project aimed at creating predictive models for stock market data. It leverages various machine learning techniques to analyze historical stock data and predict future movements. The project is structured to allow for easy creation of models, evaluation of performance metrics, and running predictions.

## File Descriptions
### top_etfs_by_sector.csv
This is what tickers are sent through the program to have a model created and predicted. Please alter this file with whatever tickers you would like.

### main.py
The entry point of the project. This script ties together various components of the project, orchestrating the model training, evaluation, and prediction processes.

### run_preds.py
A specialized script designed to run predictions using the trained models. It loads the latest model and applies it to new or unseen stock data to forecast future prices.

### model_create.py
Focuses on the creation and compilation of machine learning models. It includes functions for initializing different types of models, setting up their architecture, and compiling them for training.

### model_functions.py
Contains utility functions that support model operations, such as data preprocessing, model training, and evaluation. This file is essential for managing the data flow and ensuring the models operate efficiently.

### model_types.py
Defines the various types of models supported by the project. Each model type is tailored to different aspects of stock data analysis, offering a range of approaches for predicting stock market movements.

### metrics.py
Implements performance metrics to evaluate the accuracy and efficiency of the predictive models. This includes traditional metrics like Mean Squared Error (MSE), as well as financial-specific measures.

### stock_data.py
Responsible for fetching, processing, and managing stock data. It includes functions for retrieving historical stock prices, cleaning the data, and structuring it for use in model training and predictions.

## Usage

To use this project, you will start by running `main.py` to train your models with historical data:

```bash
python main.py
```

Refer to each script's documentation for more detailed usage instructions and options.

## Contributing
We welcome contributions! If you have suggestions for improvements or want to contribute code, please open an issue or pull request.

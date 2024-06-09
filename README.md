# HippoShark

## General Mission

**Build the foundation for open-source stock price predictions using AI/ML/general regression techniques.**

---

### Objectives

1. **Pull and Store Different Stock-Related Data:**
   - Include sentiment data from news outlets.
   - Historical stock prices.
   - Company financials.
   - Market indicators and economic data.

2. **Transform Data into Machine Learning Usable Features:**
   - Clean and preprocess the data for the model, based on various factors:
     - Sector
     - Subsector
     - Time Horizon
     - Past Performance
     - News Sentiment
     - Market Volatility
     - Technical Indicators (e.g., moving averages, RSI, MACD)
     - etc.

3. **Create Dynamic Models to Predict Various Time Horizons:**
   - Develop models that can predict stock prices over different periods:
     - Short-term (daily, weekly)
     - Medium-term (monthly, quarterly)
     - Long-term (annual)

4. **Store Models and Create Efficient Methods for Their Use:**
   - Possibly store the predictions prebuilt and allow a button for users to call certain horizons.
   - Implement a scalable storage solution for model predictions and historical data.

5. **Create an API Using Flask:**
   - Enable these endpoints to be used by other applications.
   - Ensure secure access and rate limiting for the API endpoints.

6. **Create a Front-End Experience With:**
   - **User Accounts:** Allow users to log in and manage their profiles.
   - **Subscriptions:** Enable users to subscribe to the automated detector and news synthesizer.
   - **Stock Information:** Allow users to pull stock information.
   - **Custom Models:** Allow users to create 'custom' models that take longer to process.
   - **Backtesting Systems:** Enable users to test their models against historical data.
   - **Visual Dashboards:** Provide interactive charts and graphs to visualize stock predictions and performance.

7. **Performance:**
   - Ensure the application is fast and responsive.
   - Optimize database queries and model inference times.
   - Implement caching mechanisms for frequently accessed data.

8. **Continuous Improvement:**
   - Regularly update models with new data to improve accuracy.
   - Gather user feedback to enhance features and usability.
   - Monitor system performance and make necessary optimizations.

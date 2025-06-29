import React, { useState, useEffect } from 'react';

interface WelcomeProps {
    onGetStarted: () => void;
    vscode: any;
}

const Welcome: React.FC<WelcomeProps> = ({ onGetStarted, vscode }) => {
    const handleGetStarted = () => {
        onGetStarted();
    };

    return (
        <div className="welcome-section">
            <div className="welcome-header">
                <div className="welcome-logo">
                    <div className="logo-icon">✨</div>
                    <h1>Welcome to Super Design</h1>
                </div>
                <p className="welcome-subtitle">Your AI-powered canvas for rapid UI exploration</p>
            </div>

            <div className="welcome-actions">
                <button 
                    type="button" 
                    className="btn-primary" 
                    onClick={handleGetStarted}
                >
                    Get Started
                </button>
            </div>
        </div>
    );
};

export default Welcome; 
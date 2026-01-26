import React, { useEffect, useState } from 'react';

interface LoadingScreenProps {
    onComplete: () => void;
}

const TEXT = "Shadad's Space";

const LoadingScreen: React.FC<LoadingScreenProps> = ({ onComplete }) => {
    const [displayedText, setDisplayedText] = useState("");
    const [index, setIndex] = useState(0);

    useEffect(() => {
        if (index < TEXT.length) {
            const timeout = setTimeout(() => {
                setDisplayedText((prev) => prev + TEXT[index]);
                setIndex((prev) => prev + 1);
            }, 200); // Typing speed
            return () => clearTimeout(timeout);
        } else {
            // Finished typing, wait a bit then complete
            const timeout = setTimeout(() => {
                onComplete();
            }, 1000); // 1s delay before moving to password
            return () => clearTimeout(timeout);
        }
    }, [index, onComplete]);

    return (
        <div className="h-[100dvh] w-full bg-[#FFF0F5] flex flex-col items-center justify-center font-['Caveat']">
            <h1 className="text-4xl md:text-6xl text-black font-bold tracking-widest whitespace-nowrap">
                {displayedText}
                <span className="animate-pulse">|</span>
            </h1>
        </div>
    );
};

export default LoadingScreen;

import React, { useState } from 'react';

export type UserRole = 'saeed' | 'shahad';

interface PasswordScreenProps {
    onUnlock: (user: UserRole) => void;
}

const USERS: Record<string, UserRole> = {
    "saeed": "saeed",   // Owner - can post photos
    "shahad": "shahad"  // Viewer - can view Saeed's photos
};

const PasswordScreen: React.FC<PasswordScreenProps> = ({ onUnlock }) => {
    const [input, setInput] = useState("");
    const [error, setError] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const normalizedInput = input.toLowerCase().trim();
        if (USERS[normalizedInput]) {
            onUnlock(USERS[normalizedInput]);
        } else {
            setError(true);
            setInput("");
            setTimeout(() => setError(false), 1000);
        }
    };

    return (
        <div className="h-[100dvh] w-full bg-[#FFF0F5] relative flex flex-col items-center justify-center font-['Outfit'] overflow-hidden">
            {/* Background Pattern */}
            <div
                className="absolute inset-0 opacity-10 pointer-events-none"
                style={{
                    backgroundImage: `
            linear-gradient(#FF1493 2px, transparent 2px),
            linear-gradient(90deg, #FF1493 2px, transparent 2px)
          `,
                    backgroundSize: '30px 30px'
                }}
            ></div>

            <div className="z-10 bg-white border-4 border-black p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col gap-6 max-w-sm w-full mx-4 animate-bounce-in">
                <h2 className="text-2xl font-bold text-center uppercase tracking-widest">
                    PASSWORD
                </h2>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="relative">
                        <input
                            type="password"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Enter Password"
                            className={`w-full bg-gray-50 border-2 ${error ? 'border-red-500 animate-shake' : 'border-black'} p-3 text-center text-xl focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all`}
                            autoFocus
                        />
                        {error && (
                            <span className="absolute -bottom-6 left-0 right-0 text-center text-red-500 text-xs font-bold uppercase">
                                Access Denied
                            </span>
                        )}
                    </div>

                    <button
                        type="submit"
                        className="bg-black text-white font-bold py-3 uppercase tracking-widest hover:bg-[#FF69B4] hover:text-black hover:border-black border-2 border-transparent transition-colors"
                    >
                        Unlock
                    </button>
                </form>
            </div>
        </div>
    );
};

export default PasswordScreen;

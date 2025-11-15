import React, { useEffect, useRef, useState } from "react";
import { ref, set, onValue } from "firebase/database";
import { database } from "../firebase";
import { FaPercentage, FaCoins, FaVideo, FaHeadset, FaUpload, FaImage } from "react-icons/fa";

// NOTE: Do NOT put your Cloudinary API SECRET in the browser. The Upload Widget below
// works with an **unsigned** upload preset. Ensure your preset allows unsigned uploads.
// Cloudinary config for client-side widget
const CLOUD_NAME = "deu1ngeov"; // ok to expose
const UPLOAD_PRESET = "ml_default"; // must be UNSIGNED to work client-side

// If TypeScript complains about window.cloudinary, we declare a minimal type here
declare global {
  interface Window {
    cloudinary?: any;
  }
}

interface AppConfig {
  logoUrl: string;
  appName: string;
  sliderImages: SliderImage[];
  supportUrl: string;
  tutorialVideoId: string;
  referralCommissionRate: number;
  // miningBaseAmount REMOVED per request
  miningMaxAmount: number;
  // store duration in ms in DB, but UI edits in minutes
  miningDuration: number;
}

interface SliderImage {
  id: string;
  url: string;
  alt: string;
  order: number;
  createdAt: string;
}

const AdminPanel: React.FC = () => {
  const [appConfig, setAppConfig] = useState<AppConfig>({
    logoUrl: "",
    appName: "NanoV1",
    sliderImages: [],
    supportUrl: "https://t.me/nan0v1_support",
    tutorialVideoId: "dQw4w9WgXcQ",
    referralCommissionRate: 10,
    // miningBaseAmount removed
    miningMaxAmount: 1.0,
    miningDuration: 60000, // stored in ms
  });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cloudinary Upload Widget instance
  const widgetRef = useRef<any>(null);

  // Load config from Firebase
  useEffect(() => {
    try {
      const configRef = ref(database, "appConfig");

      const unsubscribe = onValue(
        configRef,
        (snapshot) => {
          const data = snapshot.val();
          if (data) {
            setAppConfig({
              logoUrl: data.logoUrl || "",
              appName: data.appName || "NanoV1",
              sliderImages: data.sliderImages || [],
              supportUrl: data.supportUrl || "https://t.me/nan0v1_support",
              tutorialVideoId: data.tutorialVideoId || "dQw4w9WgXcQ",
              referralCommissionRate: data.referralCommissionRate ?? 10,
              // miningBaseAmount removed
              miningMaxAmount: data.miningMaxAmount ?? 1.0,
              miningDuration: data.miningDuration ?? 60000,
            });
          }
          setLoading(false);
          setError(null);
        },
        (error) => {
          setError(`Firebase Error: ${error.message}`);
          setLoading(false);
        }
      );

      return () => unsubscribe();
    } catch (err) {
      setError(`Setup Error: ${err instanceof Error ? err.message : "Unknown error"}`);
      setLoading(false);
    }
  }, []);

  // Init Cloudinary Upload Widget (requires the script tag present in index.html)
  useEffect(() => {
    if (window.cloudinary && !widgetRef.current) {
      widgetRef.current = window.cloudinary.createUploadWidget(
        {
          cloudName: CLOUD_NAME,
          uploadPreset: UPLOAD_PRESET, // must be unsigned
          multiple: false,
          maxFiles: 1,
          sources: ["local", "url", "camera"],
          folder: "logos",
          cropping: false,
          showAdvancedOptions: false,
        },
        (error: any, result: any) => {
          if (!error && result && result.event === "success") {
            const secureUrl = result.info.secure_url as string;
            setAppConfig((prev) => ({ ...prev, logoUrl: secureUrl }));
            setMessage("Logo uploaded successfully!");
          }
          if (error) {
            setMessage(`Error uploading logo: ${error?.message || error}`);
          }
        }
      );
    }
  }, []);

  const openLogoWidget = () => {
    if (!window.cloudinary) {
      setMessage(
        "Cloudinary widget not loaded. Add the script <script src=\"https://widget.cloudinary.com/v2.0/global/all.js\"></script> to your index.html"
      );
      return;
    }
    widgetRef.current?.open();
  };

  const handleInputChange = (field: keyof AppConfig, value: string | number) => {
    setAppConfig((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleReferralCommissionUpdate = async () => {
    const commissionRate = appConfig.referralCommissionRate;
    if (commissionRate < 0 || commissionRate > 100) {
      setMessage("Referral commission rate must be between 0 and 100!");
      return;
    }
    try {
      await set(ref(database, "appConfig"), appConfig);
      setMessage(`Referral commission rate updated to ${commissionRate}% successfully!`);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Error updating referral commission. Please try again.";
      setMessage(errorMessage);
      setError(errorMessage);
    }
  };

  const handleMiningSettingsUpdate = async () => {
    const maxAmount = appConfig.miningMaxAmount;
    const duration = appConfig.miningDuration; // ms

    if (maxAmount < 0 || duration < 60000) {
      setMessage("Invalid mining settings! Minimum duration is 1 minute and max must be ≥ 0.");
      return;
    }

    try {
      await set(ref(database, "appConfig"), appConfig);
      setMessage("Mining settings updated successfully!");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Error updating mining settings. Please try again.";
      setMessage(errorMessage);
      setError(errorMessage);
    }
  };

  const handleSupportTutorialUpdate = async () => {
    try {
      await set(ref(database, "appConfig"), appConfig);
      setMessage("Support & Tutorial settings updated successfully!");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Error updating settings. Please try again.";
      setMessage(errorMessage);
      setError(errorMessage);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p>Loading Admin Panel...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-red-400 mb-4">Error Loading Admin Panel</h1>
          <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 mb-4">
            <p className="text-red-300">{error}</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  const minutes = Math.max(1, Math.round(appConfig.miningDuration / 60000));

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-8 text-blue-400">NanoV1 Admin Panel</h1>

        {/* Debug Info */}
        <div className="bg-yellow-500/20 border border-yellow-500 rounded-lg p-4 mb-6">
          <p className="text-yellow-200 text-sm">
            DB Connected: {database ? "Yes" : "No"}
            <br /> Cloudinary: {window.cloudinary ? "Widget Ready" : "Script Missing"}
          </p>
        </div>

        {/* Mining Settings Section */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-blue-300 flex items-center">
            <FaCoins className="mr-2" /> Mining Configuration
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Base Amount removed per request */}

            <div>
              <label className="block text-sm font-medium mb-2">Max Amount ({appConfig.miningMaxAmount}):</label>
              <input
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                value={appConfig.miningMaxAmount}
                onChange={(e) => handleInputChange("miningMaxAmount", parseFloat(e.target.value) || 1.0)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="0.01"
              />
              <p className="text-xs text-gray-400 mt-1">Maximum mining amount</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Duration (minutes) ({minutes}):</label>
              <input
                type="number"
                min="1"
                max="300"
                step="1"
                value={minutes}
                onChange={(e) => handleInputChange("miningDuration", (parseInt(e.target.value) || 1) * 60000)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="1"
              />
              <p className="text-xs text-gray-400 mt-1">Mining duration in minutes</p>
            </div>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-4">
            <h3 className="text-sm font-semibold text-blue-300 mb-2">Current Mining Settings:</h3>
            <p className="text-sm text-blue-200">
              Amount Range: $0.00 → ${appConfig.miningMaxAmount.toFixed(2)}
              <br /> Duration: {minutes} minute{minutes === 1 ? "" : "s"}
              <br /> Progress: 0.00 → 1.00 over {minutes}m
            </p>
          </div>

          <button
            onClick={handleMiningSettingsUpdate}
            className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-6 rounded-lg transition duration-200"
          >
            Update Mining Settings
          </button>
        </div>

        {/* Referral Commission Section */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-blue-300 flex items-center">
            <FaPercentage className="mr-2" /> Referral Commission Configuration
          </h2>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Referral Commission Rate (%):</label>
            <div className="relative">
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={appConfig.referralCommissionRate}
                onChange={(e) => handleInputChange("referralCommissionRate", parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-12"
                placeholder="Enter commission percentage"
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                <span className="text-gray-400">%</span>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1">Set the referral commission percentage (0-100%). Example: 10 for 10% commission</p>
          </div>

          <button onClick={handleReferralCommissionUpdate} className="bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 px-6 rounded-lg transition duration-200">
            Update Commission Rate
          </button>
        </div>

        {/* Support & Tutorial Configuration Section */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-blue-300 flex items-center">
            <FaHeadset className="mr-2" /> Support & Tutorial Configuration
          </h2>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Support Telegram URL:</label>
            <input
              type="text"
              value={appConfig.supportUrl || ""}
              onChange={(e) => handleInputChange("supportUrl", e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="https://t.me/YourChannelName"
            />
            <p className="text-xs text-gray-400 mt-1">Enter the full Telegram URL for support</p>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-2 flex items-center">
              <FaVideo className="mr-2" /> YouTube Tutorial Video ID:
            </label>
            <input
              type="text"
              value={appConfig.tutorialVideoId || ""}
              onChange={(e) => handleInputChange("tutorialVideoId", e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="dQw4w9WgXcQ"
            />
            <p className="text-xs text-gray-400 mt-1">Enter only the YouTube video ID (the part after "v=" in the URL)</p>
          </div>

          <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-4 mb-4">
            <h3 className="text-sm font-semibold text-purple-300 mb-2">Preview:</h3>
            <p className="text-sm text-purple-200">
              Support URL: <a href={appConfig.supportUrl} target="_blank" rel="noopener noreferrer" className="underline">{appConfig.supportUrl}</a>
              <br /> Tutorial Video: <a href={`https://www.youtube.com/watch?v=${appConfig.tutorialVideoId}`} target="_blank" rel="noopener noreferrer" className="underline">Watch Tutorial</a>
            </p>
          </div>

          <button onClick={handleSupportTutorialUpdate} className="bg-purple-500 hover:bg-purple-600 text-white font-semibold py-2 px-6 rounded-lg transition duration-200">
            Update Support & Tutorial
          </button>
        </div>

        {/* App Basic Configuration */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-blue-300">App Basic Configuration</h2>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">App Name:</label>
            <input
              type="text"
              value={appConfig.appName || ""}
              onChange={(e) => handleInputChange("appName", e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="NanoV1"
            />
          </div>

          {/* Logo Upload (Cloudinary) */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2 flex items-center">
              <FaImage className="mr-2" /> App Logo:
            </label>
            <div className="flex items-center gap-3">
              <button onClick={openLogoWidget} className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded">
                <FaUpload /> Upload Logo
              </button>
              {appConfig.logoUrl && (
                <a href={appConfig.logoUrl} target="_blank" rel="noopener noreferrer" className="text-sm underline">View current logo</a>
              )}
            </div>
            {appConfig.logoUrl && (
              <div className="mt-3">
                <img src={appConfig.logoUrl} alt="App Logo" className="h-16 w-auto rounded bg-gray-700 p-2" />
              </div>
            )}
          </div>

          <button onClick={handleSupportTutorialUpdate} className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-6 rounded-lg transition duration-200">
            Update App Settings
          </button>
        </div>

        {/* Message Display */}
        {message && (
          <div className={`p-4 rounded-md mb-4 ${message.includes("Error") ? "bg-red-500" : "bg-green-500"}`}>
            <div className="flex items-center">
              {message.includes("Error") ? (
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              )}
              {message}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;

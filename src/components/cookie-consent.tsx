"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { COOKIE_CONSENT_KEY, initAnalytics } from "@/lib/analytics/browser";

export function CookieConsent() {
  const [showBanner, setShowBanner] = useState(false);
  const [preference, setPreference] = useState<"pending" | "accepted" | "rejected">("pending");

  useEffect(() => {
    // Check localStorage for existing preference
    const stored = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (stored) {
      setPreference(stored as "accepted" | "rejected");
      setShowBanner(false);
    } else {
      setShowBanner(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, "accepted");
    setPreference("accepted");
    setShowBanner(false);
    // Consent just granted — start PostHog now. No reload: initAnalytics()
    // reads the freshly-written localStorage flag and initialises in place.
    initAnalytics();
  };

  const handleReject = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, "rejected");
    setPreference("rejected");
    setShowBanner(false);
  };

  const handleClose = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, "rejected");
    setPreference("rejected");
    setShowBanner(false);
  };

  if (!showBanner || preference !== "pending") {
    return null;
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 bg-[#0A1E30] border-t border-[#102A43] shadow-2xl"
      role="dialog"
      aria-label="Cookie consent"
    >
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          {/* Message */}
          <div className="flex-1">
            <p className="text-sm text-[#9FB3C8] mb-2">
              <strong className="text-white">We use cookies to improve your experience.</strong>
            </p>
            <p className="text-xs text-[#627D98] mb-3 md:mb-0">
              Essential cookies (session authentication) are always active. We also offer optional analytics cookies to understand how you use ProjectIntelligence. See our{" "}
              <Link
                href="/privacy"
                className="text-[#D97706] hover:text-[#F59E0B] underline"
              >
                Privacy Policy
              </Link>
              {" "}for details.
            </p>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 md:flex-shrink-0">
            <button
              onClick={handleReject}
              className="flex-1 md:flex-initial px-4 py-2 text-sm font-medium text-[#9FB3C8] bg-transparent border border-[#102A43] rounded hover:border-[#627D98] transition-colors duration-150"
              aria-label="Reject analytics cookies"
            >
              Reject
            </button>
            <button
              onClick={handleAccept}
              className="flex-1 md:flex-initial px-4 py-2 text-sm font-medium text-white bg-[#D97706] rounded hover:bg-[#B45309] transition-colors duration-150"
              aria-label="Accept all cookies"
            >
              Accept Analytics
            </button>
          </div>

          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 md:static text-[#627D98] hover:text-[#9FB3C8] transition-colors duration-150"
            aria-label="Close cookie banner"
          >
            <X size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

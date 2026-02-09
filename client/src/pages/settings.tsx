import { BotSettings } from "@/components/bot-settings";
import { Card } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <div className="h-full overflow-auto p-4">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-base font-semibold mb-4">Ustawienia TeamSpeak</h2>
        <BotSettings />
      </div>
    </div>
  );
}

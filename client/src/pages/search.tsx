import { SearchPanel } from "@/components/search-panel";
import { Card } from "@/components/ui/card";
import { usePlayer } from "@/hooks/use-player";

export default function SearchPage() {
  const { addToQueue } = usePlayer();

  return (
    <div className="h-full overflow-auto p-4">
      <div className="max-w-2xl mx-auto">
        <Card className="p-4">
          <h2 className="text-base font-semibold mb-4">Wyszukiwanie muzyki</h2>
          <SearchPanel onAddToQueue={addToQueue} />
        </Card>
      </div>
    </div>
  );
}

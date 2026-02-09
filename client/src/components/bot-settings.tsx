import { useState, useEffect } from "react";
import { Save, Loader2, Wifi, WifiOff, Server, TestTube2, Search, CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { BotConfig, BotStatus } from "@shared/schema";

interface DiscoveryResult {
  success: boolean;
  ip: string | null;
  queryPort: number | null;
  serverPort: number | null;
  protocol: "raw" | "ssh" | null;
  steps: string[];
  isBehindCloudflare: boolean;
}

export function BotSettings() {
  const { toast } = useToast();
  const [config, setConfig] = useState({
    serverAddress: "",
    serverPort: 9987,
    queryPort: 10011,
    username: "serveradmin",
    password: "",
    nickname: "MusicBot",
    defaultChannel: "",
  });
  const [discoveryResult, setDiscoveryResult] = useState<DiscoveryResult | null>(null);

  const { data: savedConfig } = useQuery<BotConfig>({
    queryKey: ["/api/bot/config"],
  });

  const { data: botStatus } = useQuery<BotStatus>({
    queryKey: ["/api/bot/status"],
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (savedConfig) {
      setConfig({
        serverAddress: savedConfig.serverAddress,
        serverPort: savedConfig.serverPort,
        queryPort: savedConfig.queryPort,
        username: savedConfig.username,
        password: savedConfig.password,
        nickname: savedConfig.nickname,
        defaultChannel: savedConfig.defaultChannel,
      });
    }
  }, [savedConfig]);

  const saveConfigMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", "/api/bot/config", config);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bot/config"] });
      toast({ title: "Konfiguracja zapisana" });
    },
    onError: (err: any) => {
      toast({ title: "Biad", description: err.message, variant: "destructive" });
    },
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/bot/connect");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bot/status"] });
      toast({ title: "Polaczono z TeamSpeak" });
    },
    onError: (err: any) => {
      toast({ title: "Blad polaczenia", description: err.message, variant: "destructive" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/bot/disconnect");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bot/status"] });
      toast({ title: "Rozlaczono" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/bot/test");
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: data.reachable ? "Port dostepny" : "Port niedostepny",
        description: data.message,
        variant: data.reachable ? "default" : "destructive",
      });
    },
    onError: (err: any) => {
      toast({ title: "Blad testu", description: err.message, variant: "destructive" });
    },
  });

  const discoverMutation = useMutation({
    mutationFn: async () => {
      const domain = config.serverAddress.trim();
      if (!domain) throw new Error("Wpisz adres/domene serwera");
      const res = await apiRequest("POST", "/api/bot/discover", { domain });
      return res.json();
    },
    onSuccess: (data: DiscoveryResult) => {
      setDiscoveryResult(data);
      if (data.success && data.ip && data.queryPort) {
        setConfig((c) => ({
          ...c,
          serverAddress: data.ip!,
          queryPort: data.queryPort!,
          serverPort: data.serverPort || c.serverPort,
        }));
        toast({
          title: "Znaleziono serwer",
          description: `IP: ${data.ip}, Query: ${data.queryPort} (${data.protocol})`,
        });
      } else {
        toast({
          title: "Nie znaleziono serwera",
          description: "Szczegoly ponizej. Moze byc potrzebne reczne podanie IP.",
          variant: "destructive",
        });
      }
    },
    onError: (err: any) => {
      toast({ title: "Blad wykrywania", description: err.message, variant: "destructive" });
    },
  });

  const applyDiscovery = () => {
    if (discoveryResult?.success && discoveryResult.ip && discoveryResult.queryPort) {
      setConfig((c) => ({
        ...c,
        serverAddress: discoveryResult.ip!,
        queryPort: discoveryResult.queryPort!,
        serverPort: discoveryResult.serverPort || c.serverPort,
      }));
      toast({ title: "Ustawienia zastosowane" });
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-medium" data-testid="text-status-heading">Status TeamSpeak</h3>
          </div>
          <Badge variant={botStatus?.connected ? "default" : "secondary"} data-testid="badge-bot-status">
            {botStatus?.connected ? (
              <Wifi className="w-3 h-3 mr-1" />
            ) : (
              <WifiOff className="w-3 h-3 mr-1" />
            )}
            {botStatus?.connected ? "Polaczono" : "Rozlaczono"}
          </Badge>
        </div>

        {botStatus?.connected && (
          <div className="space-y-1 mb-4 text-xs text-muted-foreground">
            <p data-testid="text-server-name">Serwer: {botStatus.serverName}</p>
            <p data-testid="text-channel">Kanal: {botStatus.channel}</p>
            <p data-testid="text-clients">Klienci: {botStatus.clients}</p>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          {botStatus?.connected ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              data-testid="button-disconnect"
            >
              {disconnectMutation.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ) : (
                <WifiOff className="w-3 h-3 mr-1" />
              )}
              Rozlacz
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                onClick={() => connectMutation.mutate()}
                disabled={connectMutation.isPending}
                data-testid="button-connect"
              >
                {connectMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                ) : (
                  <Wifi className="w-3 h-3 mr-1" />
                )}
                Polacz
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending}
                data-testid="button-test-connection"
              >
                {testMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                ) : (
                  <TestTube2 className="w-3 h-3 mr-1" />
                )}
                Test polaczenia
              </Button>
            </>
          )}
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-medium">Konfiguracja serwera</h3>

        <div className="space-y-2">
          <Label htmlFor="serverAddress" className="text-xs">Adres serwera (domena lub IP)</Label>
          <div className="flex gap-2">
            <Input
              id="serverAddress"
              value={config.serverAddress}
              onChange={(e) => setConfig((c) => ({ ...c, serverAddress: e.target.value }))}
              placeholder="pol-speak.pl lub 123.45.67.89"
              data-testid="input-server-address"
            />
            <Button
              variant="outline"
              size="default"
              onClick={() => discoverMutation.mutate()}
              disabled={discoverMutation.isPending || !config.serverAddress.trim()}
              data-testid="button-auto-discover"
            >
              {discoverMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Wpisz domene i kliknij lupe - automatycznie znajde IP i port Query
          </p>
        </div>

        {discoveryResult && (
          <Card className="p-3 space-y-2 bg-muted/30">
            <div className="flex items-center gap-2 mb-1">
              {discoveryResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-destructive shrink-0" />
              )}
              <span className="text-xs font-medium">
                {discoveryResult.success ? "Serwer znaleziony" : "Nie znaleziono serwera"}
              </span>
            </div>

            <div className="space-y-0.5 text-[11px] text-muted-foreground max-h-32 overflow-y-auto">
              {discoveryResult.steps.map((step, i) => (
                <div key={i} className="flex gap-1">
                  <ArrowRight className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>{step}</span>
                </div>
              ))}
            </div>

            {discoveryResult.success && discoveryResult.ip && (
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                <Badge variant="secondary" className="text-[10px]">
                  IP: {discoveryResult.ip}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  Query: {discoveryResult.queryPort} ({discoveryResult.protocol})
                </Badge>
                {discoveryResult.serverPort && discoveryResult.serverPort !== 9987 && (
                  <Badge variant="secondary" className="text-[10px]">
                    Voice: {discoveryResult.serverPort}
                  </Badge>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={applyDiscovery}
                  data-testid="button-apply-discovery"
                >
                  Zastosuj
                </Button>
              </div>
            )}
          </Card>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <Label htmlFor="serverPort" className="text-xs">Port serwera (voice)</Label>
            <Input
              id="serverPort"
              type="number"
              value={config.serverPort}
              onChange={(e) => setConfig((c) => ({ ...c, serverPort: parseInt(e.target.value) || 9987 }))}
              data-testid="input-server-port"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="queryPort" className="text-xs">Port Query</Label>
            <Input
              id="queryPort"
              type="number"
              value={config.queryPort}
              onChange={(e) => setConfig((c) => ({ ...c, queryPort: parseInt(e.target.value) || 10011 }))}
              data-testid="input-query-port"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="username" className="text-xs">Nazwa uzytkownika</Label>
          <Input
            id="username"
            value={config.username}
            onChange={(e) => setConfig((c) => ({ ...c, username: e.target.value }))}
            placeholder="serveradmin"
            data-testid="input-username"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-xs">Haslo</Label>
          <Input
            id="password"
            type="password"
            value={config.password}
            onChange={(e) => setConfig((c) => ({ ...c, password: e.target.value }))}
            placeholder="Haslo ServerQuery"
            data-testid="input-password"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="nickname" className="text-xs">Nazwa bota</Label>
          <Input
            id="nickname"
            value={config.nickname}
            onChange={(e) => setConfig((c) => ({ ...c, nickname: e.target.value }))}
            placeholder="MusicBot"
            data-testid="input-nickname"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="defaultChannel" className="text-xs">Domyslny kanal</Label>
          <Input
            id="defaultChannel"
            value={config.defaultChannel}
            onChange={(e) => setConfig((c) => ({ ...c, defaultChannel: e.target.value }))}
            placeholder="Nazwa kanalu"
            data-testid="input-default-channel"
          />
        </div>

        <Button
          className="w-full"
          onClick={() => saveConfigMutation.mutate()}
          disabled={saveConfigMutation.isPending}
          data-testid="button-save-config"
        >
          {saveConfigMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin mr-1" />
          ) : (
            <Save className="w-4 h-4 mr-1" />
          )}
          Zapisz konfiguracje
        </Button>
      </Card>
    </div>
  );
}

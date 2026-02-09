import { useState, useEffect } from "react";
import { Save, Loader2, Wifi, WifiOff, Server, RefreshCw, TestTube2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { BotConfig, BotStatus } from "@shared/schema";

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
      toast({ title: "Błąd", description: err.message, variant: "destructive" });
    },
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/bot/connect");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bot/status"] });
      toast({ title: "Połączono z TeamSpeak" });
    },
    onError: (err: any) => {
      toast({ title: "Błąd połączenia", description: err.message, variant: "destructive" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/bot/disconnect");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bot/status"] });
      toast({ title: "Rozłączono" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/bot/test");
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: data.reachable ? "Port dostępny" : "Port niedostępny",
        description: data.message,
        variant: data.reachable ? "default" : "destructive",
      });
    },
    onError: (err: any) => {
      toast({ title: "Błąd testu", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Status TeamSpeak</h3>
          </div>
          <Badge variant={botStatus?.connected ? "default" : "secondary"}>
            {botStatus?.connected ? (
              <Wifi className="w-3 h-3 mr-1" />
            ) : (
              <WifiOff className="w-3 h-3 mr-1" />
            )}
            {botStatus?.connected ? "Połączono" : "Rozłączono"}
          </Badge>
        </div>

        {botStatus?.connected && (
          <div className="space-y-1 mb-4 text-xs text-muted-foreground">
            <p>Serwer: {botStatus.serverName}</p>
            <p>Kanał: {botStatus.channel}</p>
            <p>Klienci: {botStatus.clients}</p>
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
              Rozłącz
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
                Połącz
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
                Test połączenia
              </Button>
            </>
          )}
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-medium">Konfiguracja serwera</h3>

        <div className="space-y-2">
          <Label htmlFor="serverAddress" className="text-xs">Adres serwera</Label>
          <Input
            id="serverAddress"
            value={config.serverAddress}
            onChange={(e) => setConfig((c) => ({ ...c, serverAddress: e.target.value }))}
            placeholder="ts.example.com"
            data-testid="input-server-address"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <Label htmlFor="serverPort" className="text-xs">Port serwera</Label>
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
          <Label htmlFor="username" className="text-xs">Nazwa użytkownika</Label>
          <Input
            id="username"
            value={config.username}
            onChange={(e) => setConfig((c) => ({ ...c, username: e.target.value }))}
            placeholder="serveradmin"
            data-testid="input-username"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-xs">Hasło</Label>
          <Input
            id="password"
            type="password"
            value={config.password}
            onChange={(e) => setConfig((c) => ({ ...c, password: e.target.value }))}
            placeholder="Hasło ServerQuery"
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
          <Label htmlFor="defaultChannel" className="text-xs">Domyślny kanał</Label>
          <Input
            id="defaultChannel"
            value={config.defaultChannel}
            onChange={(e) => setConfig((c) => ({ ...c, defaultChannel: e.target.value }))}
            placeholder="Nazwa kanału"
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
          Zapisz konfigurację
        </Button>
      </Card>
    </div>
  );
}

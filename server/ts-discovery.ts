import dns from "dns";
import net from "net";
import { log } from "./index";

const CLOUDFLARE_ASN_RANGES = [
  "104.16.", "104.17.", "104.18.", "104.19.", "104.20.", "104.21.", "104.22.", "104.23.", "104.24.", "104.25.", "104.26.", "104.27.",
  "172.64.", "172.65.", "172.66.", "172.67.", "172.68.", "172.69.", "172.70.", "172.71.",
  "173.245.",
  "103.21.", "103.22.", "103.31.",
  "141.101.",
  "108.162.",
  "190.93.",
  "188.114.",
  "197.234.",
  "198.41.",
];

function isCloudflareIP(ip: string): boolean {
  return CLOUDFLARE_ASN_RANGES.some((prefix) => ip.startsWith(prefix));
}

function resolveHostname(hostname: string): Promise<string[]> {
  return new Promise((resolve) => {
    dns.resolve4(hostname, (err, addresses) => {
      if (err) resolve([]);
      else resolve(addresses);
    });
  });
}

function resolveSRV(name: string): Promise<dns.SrvRecord[]> {
  return new Promise((resolve) => {
    dns.resolveSrv(name, (err, records) => {
      if (err) resolve([]);
      else resolve(records);
    });
  });
}

function resolveTXT(name: string): Promise<string[][]> {
  return new Promise((resolve) => {
    dns.resolveTxt(name, (err, records) => {
      if (err) resolve([]);
      else resolve(records);
    });
  });
}

function testTCPPort(host: string, port: number, timeout = 4000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

export interface DiscoveryResult {
  success: boolean;
  ip: string | null;
  queryPort: number | null;
  serverPort: number | null;
  protocol: "raw" | "ssh" | null;
  steps: string[];
  isBehindCloudflare: boolean;
}

export async function discoverTeamspeakServer(domain: string): Promise<DiscoveryResult> {
  const steps: string[] = [];
  let foundIp: string | null = null;
  let foundQueryPort: number | null = null;
  let foundServerPort: number | null = null;
  let foundProtocol: "raw" | "ssh" | null = null;
  let isBehindCloudflare = false;

  const baseDomain = domain.replace(/^(ts3?|voice|teamspeak)\./i, "");

  steps.push(`Szukam serwera dla: ${domain}`);

  const srvName = `_ts3._udp.${domain}`;
  steps.push(`Sprawdzam rekord SRV: ${srvName}`);
  const srvRecords = await resolveSRV(srvName);

  if (srvRecords.length > 0) {
    const srv = srvRecords[0];
    steps.push(`Znaleziono SRV: ${srv.name}:${srv.port} (priorytet: ${srv.priority})`);
    foundServerPort = srv.port;

    const srvIps = await resolveHostname(srv.name);
    if (srvIps.length > 0) {
      const ip = srvIps[0];
      if (!isCloudflareIP(ip)) {
        foundIp = ip;
        steps.push(`IP z SRV: ${ip}`);
      } else {
        steps.push(`SRV wskazuje na Cloudflare IP (${ip}), szukam dalej...`);
      }
    }
  } else {
    steps.push("Brak rekordu SRV");
  }

  if (baseDomain !== domain) {
    const baseSrv = `_ts3._udp.${baseDomain}`;
    steps.push(`Sprawdzam SRV dla domeny bazowej: ${baseSrv}`);
    const baseSrvRecords = await resolveSRV(baseSrv);
    if (baseSrvRecords.length > 0) {
      const srv = baseSrvRecords[0];
      steps.push(`Znaleziono SRV: ${srv.name}:${srv.port}`);
      if (!foundServerPort) foundServerPort = srv.port;
      if (!foundIp) {
        const srvIps = await resolveHostname(srv.name);
        if (srvIps.length > 0 && !isCloudflareIP(srvIps[0])) {
          foundIp = srvIps[0];
          steps.push(`IP z SRV bazowej: ${foundIp}`);
        }
      }
    }
  }

  const directIps = await resolveHostname(domain);
  if (directIps.length > 0) {
    const ip = directIps[0];
    if (isCloudflareIP(ip)) {
      isBehindCloudflare = true;
      steps.push(`${domain} -> ${ip} (Cloudflare - to nie jest prawdziwy IP serwera)`);
    } else {
      if (!foundIp) {
        foundIp = ip;
        steps.push(`${domain} -> ${ip} (bezpośredni IP)`);
      }
    }
  }

  if (!foundIp && isBehindCloudflare) {
    const subdomains = [
      `ts.${baseDomain}`, `ts3.${baseDomain}`, `voice.${baseDomain}`,
      `teamspeak.${baseDomain}`, `game.${baseDomain}`, `srv.${baseDomain}`,
      `server.${baseDomain}`, `panel.${baseDomain}`, `direct.${baseDomain}`,
      `vps.${baseDomain}`, `host.${baseDomain}`, `mc.${baseDomain}`,
    ];

    steps.push("Domena za Cloudflare - sprawdzam popularne subdomeny...");

    const subResults = await Promise.all(
      subdomains.map(async (sub) => {
        const ips = await resolveHostname(sub);
        return { sub, ips };
      })
    );

    for (const { sub, ips } of subResults) {
      if (ips.length > 0 && !isCloudflareIP(ips[0])) {
        foundIp = ips[0];
        steps.push(`Znaleziono: ${sub} -> ${ips[0]} (nie-Cloudflare)`);
        break;
      }
    }

    if (!foundIp) {
      steps.push("Nie znaleziono bezpośredniego IP w subdomenach");

      steps.push("Sprawdzam rekordy TXT...");
      const txtRecords = await resolveTXT(domain);
      const baseTxtRecords = domain !== baseDomain ? await resolveTXT(baseDomain) : [];
      const allTxt = [...txtRecords, ...baseTxtRecords];

      for (const record of allTxt) {
        const txt = record.join("");
        const ipMatch = txt.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
        if (ipMatch && !isCloudflareIP(ipMatch[1])) {
          foundIp = ipMatch[1];
          steps.push(`Znaleziono IP w TXT: ${foundIp}`);
          break;
        }
      }
    }
  }

  const ipsToTry: string[] = [];
  if (foundIp) ipsToTry.push(foundIp);

  if (isBehindCloudflare && !foundIp) {
    steps.push("Nie udało się znaleźć bezpośredniego IP w subdomenach.");
  }

  if (srvRecords.length > 0) {
    const srvHost = srvRecords[0].name;
    const srvIps = await resolveHostname(srvHost);
    for (const ip of srvIps) {
      if (!ipsToTry.includes(ip)) ipsToTry.push(ip);
    }
  }

  if (ipsToTry.length > 0) {
    const queryPorts = [10011, 10022];

    for (const ip of ipsToTry) {
      steps.push(`Skanuję porty Query na ${ip}...`);

      const portResults = await Promise.all(
        queryPorts.map(async (port) => {
          const open = await testTCPPort(ip, port);
          return { port, open };
        })
      );

      for (const { port, open } of portResults) {
        if (open) {
          foundIp = ip;
          foundQueryPort = port;
          foundProtocol = port === 10022 ? "ssh" : "raw";
          steps.push(`Port ${port} (${foundProtocol}) jest otwarty na ${ip}`);
          break;
        } else {
          steps.push(`Port ${port} na ${ip} - zamknięty/niedostępny`);
        }
      }

      if (foundQueryPort) break;
    }

    if (!foundQueryPort) {
      steps.push("Porty Query (10011, 10022) są zamknięte na wszystkich znalezionych IP.");
      steps.push("Serwer może wymagać połączenia przez TSDNS lub ma niestandardowy port Query.");
      steps.push("Spróbuję połączyć bezpośrednio z domeną...");

      for (const port of queryPorts) {
        const open = await testTCPPort(domain, port);
        if (open) {
          foundIp = domain;
          foundQueryPort = port;
          foundProtocol = port === 10022 ? "ssh" : "raw";
          steps.push(`Port ${port} (${foundProtocol}) dostępny przez domenę ${domain}`);
          break;
        }
      }

      if (!foundQueryPort) {
        steps.push("Porty Query niedostępne też przez domenę.");
        steps.push("Możliwe przyczyny: firewall blokuje port Query, serwer ma niestandardowy port, lub TSDNS routing.");
      }
    }
  } else {
    steps.push("Nie udało się znaleźć żadnego IP serwera.");
    if (isBehindCloudflare) {
      steps.push("Domena jest za Cloudflare. Musisz podać IP ręcznie (zapytaj admina serwera).");
    }
  }

  const success = foundIp !== null && foundQueryPort !== null;

  return {
    success,
    ip: foundIp,
    queryPort: foundQueryPort,
    serverPort: foundServerPort || 9987,
    protocol: foundProtocol,
    steps,
    isBehindCloudflare,
  };
}

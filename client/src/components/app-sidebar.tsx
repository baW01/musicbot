import { Music, Search, ListMusic, Settings, Radio } from "lucide-react";
import { useLocation, Link } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";

const items = [
  { title: "Odtwarzacz", url: "/", icon: Music },
  { title: "Szukaj", url: "/search", icon: Search },
  { title: "Playlisty", url: "/playlists", icon: ListMusic },
  { title: "Ustawienia", url: "/settings", icon: Settings },
];

interface AppSidebarProps {
  queueCount: number;
  isPlaying: boolean;
  currentSongTitle: string | null;
}

export function AppSidebar({ queueCount, isPlaying, currentSongTitle }: AppSidebarProps) {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
            <Radio className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-bold leading-tight">TS Music Bot</h1>
            <p className="text-[10px] text-muted-foreground leading-tight">TeamSpeak Music Player</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                  >
                    <Link href={item.url}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                      {item.url === "/" && queueCount > 0 && (
                        <Badge variant="secondary" className="ml-auto text-[10px]">
                          {queueCount}
                        </Badge>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        {currentSongTitle && (
          <div className="p-2 rounded-md bg-card border border-card-border">
            <div className="flex items-center gap-2">
              {isPlaying && (
                <div className="flex items-center gap-0.5 shrink-0">
                  <span className="w-0.5 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: "0ms" }} />
                  <span className="w-0.5 h-3 bg-primary rounded-full animate-pulse" style={{ animationDelay: "150ms" }} />
                  <span className="w-0.5 h-1.5 bg-primary rounded-full animate-pulse" style={{ animationDelay: "300ms" }} />
                </div>
              )}
              <p className="text-[10px] text-muted-foreground truncate">{currentSongTitle}</p>
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

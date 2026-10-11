import { HammerIcon, InboxIcon, LayoutDashboardIcon, MoonIcon, SunIcon, SunMoonIcon } from 'lucide-react'
import type { Workspace } from '../shared/types'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Spinner } from '@/components/ui/spinner'
import { useWorkspace } from '@/lib/api'
import { href, useRoute } from '@/lib/route'
import { useTheme, type Theme } from '@/lib/theme'
import { Kanban } from '@/pages/kanban'
import { Overview } from '@/pages/overview'

const NEXT_THEME: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }
const THEME_ICON = { system: SunMoonIcon, light: SunIcon, dark: MoonIcon }
const THEME_LABEL = { system: 'Tema: ikuti sistem', light: 'Tema: terang', dark: 'Tema: gelap' }

export function App() {
  const route = useRoute()
  const { data, error, moveCard } = useWorkspace()
  const { theme, setTheme } = useTheme()
  const ThemeIcon = THEME_ICON[theme]

  const project = route.page === 'project' ? data?.projects.find((p) => p.id === route.projectId) : undefined
  const title = route.page === 'project' ? (project?.repo ?? route.projectId) : 'Ringkasan workspace'

  return (
    <SidebarProvider>
      <AppSidebar data={data} route={route} />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur">
          <SidebarTrigger />
          <h1 className="truncate font-heading font-semibold text-base">{title}</h1>
          {data?.sample && (
            <Badge variant="warning" className="ml-1">
              Data contoh
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto"
            aria-label={THEME_LABEL[theme]}
            title={THEME_LABEL[theme]}
            onClick={() => setTheme(NEXT_THEME[theme])}
          >
            <ThemeIcon />
          </Button>
        </header>

        <main className="flex min-w-0 flex-1 flex-col gap-4 p-4">
          {error && (
            <Alert variant="error">
              <AlertTitle>Gagal memuat workspace</AlertTitle>
              <AlertDescription>{error}. Halaman mencoba lagi otomatis setiap 30 detik.</AlertDescription>
            </Alert>
          )}
          {!data && !error && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Spinner /> Memuat workspace…
            </div>
          )}
          {data && route.page === 'overview' && <Overview data={data} />}
          {data && route.page === 'project' && (
            <Kanban
              cards={data.cards.filter((c) => c.projectId === route.projectId)}
              onMove={moveCard}
              projectKnown={project !== undefined}
            />
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

function AppSidebar({ data, route }: { data: Workspace | null; route: ReturnType<typeof useRoute> }) {
  const butuh = data?.cards.filter((c) => c.column === 'butuh').length ?? 0
  const online = data?.nodes.filter((n) => n.online).length ?? 0

  return (
    <Sidebar>
      <SidebarHeader>
        <a href={href.overview} className="flex items-center gap-2 px-2 py-1.5 font-heading font-semibold">
          <HammerIcon className="size-4" /> Pandai
        </a>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={route.page === 'overview'} render={<a href={href.overview} />}>
                  <LayoutDashboardIcon /> Ringkasan
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton render={<a href={`${href.overview}`} />}>
                  <InboxIcon /> Butuh kamu
                </SidebarMenuButton>
                {butuh > 0 && <SidebarMenuBadge>{butuh}</SidebarMenuBadge>}
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Proyek</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {data?.projects.map((p) => (
                <SidebarMenuItem key={p.id}>
                  <SidebarMenuButton
                    isActive={route.page === 'project' && route.projectId === p.id}
                    render={<a href={href.project(p.id)} />}
                  >
                    <span className="truncate">{p.id}</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge>{data.cards.filter((c) => c.projectId === p.id && c.column !== 'selesai').length}</SidebarMenuBadge>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-2 px-2 text-muted-foreground text-xs">
          <span className={`size-2 rounded-full ${online > 0 ? 'bg-success' : 'bg-destructive'}`} aria-hidden />
          {data ? `${online}/${data.nodes.length} node online` : 'Node: memuat…'}
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

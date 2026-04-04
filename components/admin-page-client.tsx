"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Search, Users, ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react"
import type { ClanMember, Race, Tier } from "@/lib/types/tufelo"
import {
  addMemberAction,
  deleteMemberAction,
  updateMemberAction,
  type ActionResult,
} from "@/app/actions/members"

type CliqueTier = Tier

const raceColors: Record<string, string> = {
  T: "bg-blue-600/20 text-blue-400 border-blue-500/30",
  P: "bg-amber-600/20 text-amber-400 border-amber-500/30",
  Z: "bg-red-600/20 text-red-400 border-red-500/30",
}

const raceNames: Record<string, string> = {
  T: "Terran",
  P: "Protoss",
  Z: "Zerg",
}

const tierColors: Record<CliqueTier, string> = {
  1: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  2: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  3: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  4: "bg-green-500/20 text-green-400 border-green-500/30",
}

const TIERS: CliqueTier[] = [1, 2, 3, 4]

interface AdminPageClientProps {
  initialMembers: ClanMember[]
}

export function AdminPageClient({ initialMembers }: AdminPageClientProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [searchQuery, setSearchQuery] = useState("")
  const [filterTier, setFilterTier] = useState("__all__")
  const [filterRace, setFilterRace] = useState("__all__")
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedMember, setSelectedMember] = useState<ClanMember | null>(null)
  const [formData, setFormData] = useState<{ name: string; race: Race; tier: CliqueTier }>({
    name: "",
    race: "T",
    tier: 4,
  })

  const filteredMembers = useMemo(
    () =>
      initialMembers.filter((member) => {
        const matchesSearch = member.name.toLowerCase().includes(searchQuery.toLowerCase())
        const matchesTier = filterTier === "__all__" || String(member.tier) === filterTier
        const matchesRace = filterRace === "__all__" || member.race === filterRace
        return matchesSearch && matchesTier && matchesRace
      }),
    [initialMembers, searchQuery, filterTier, filterRace],
  )

  const runAction = (fn: () => Promise<ActionResult>, onDone?: () => void) => {
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) {
        window.alert(res.error)
        return
      }
      onDone?.()
      router.refresh()
    })
  }

  const handleAdd = () => {
    if (!formData.name.trim()) return
    runAction(
      () => addMemberAction({ name: formData.name, race: formData.race, tier: formData.tier }),
      () => {
        setFormData({ name: "", race: "T", tier: 4 })
        setIsAddDialogOpen(false)
      },
    )
  }

  const handleEdit = () => {
    if (!selectedMember || !formData.name.trim()) return
    runAction(
      () =>
        updateMemberAction({
          id: selectedMember.id,
          name: formData.name,
          race: formData.race,
          tier: formData.tier,
        }),
      () => {
        setIsEditDialogOpen(false)
        setSelectedMember(null)
      },
    )
  }

  const handleDelete = () => {
    if (!selectedMember) return
    runAction(() => deleteMemberAction(selectedMember.id), () => {
      setIsDeleteDialogOpen(false)
      setSelectedMember(null)
    })
  }

  const openEditDialog = (member: ClanMember) => {
    setSelectedMember(member)
    setFormData({ name: member.name, race: member.race, tier: member.tier })
    setIsEditDialogOpen(true)
  }

  const openDeleteDialog = (member: ClanMember) => {
    setSelectedMember(member)
    setIsDeleteDialogOpen(true)
  }

  const tierCounts: Record<CliqueTier, number> = {
    1: filteredMembers.filter((m) => m.tier === 1).length,
    2: filteredMembers.filter((m) => m.tier === 2).length,
    3: filteredMembers.filter((m) => m.tier === 3).length,
    4: filteredMembers.filter((m) => m.tier === 4).length,
  }
  const totalFilteredCount = filteredMembers.length

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <header className="mb-10">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/">
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-primary" />
              <h1 className="text-3xl font-bold text-foreground">클랜원 명단 관리</h1>
            </div>
          </div>
          <p className="text-muted-foreground ml-14">클랜원을 추가, 수정, 삭제하고 명단을 관리합니다</p>
        </header>

        <section className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {TIERS.map((tier) => (
            <div key={tier} className="bg-card rounded-lg border border-border p-4">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className={tierColors[tier]}>
                  {tier}티어
                </Badge>
              </div>
              <p className="text-2xl font-bold text-foreground">{tierCounts[tier]}</p>
              <p className="text-xs text-muted-foreground">명</p>
            </div>
          ))}
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="bg-secondary text-secondary-foreground border-border">
                전체
              </Badge>
            </div>
            <p className="text-2xl font-bold text-foreground">{totalFilteredCount}</p>
            <p className="text-xs text-muted-foreground">명</p>
          </div>
        </section>

        <section className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="선수 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-card border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Select value={filterTier} onValueChange={setFilterTier}>
                <SelectTrigger className="w-36 bg-card border-border text-foreground">
                  <SelectValue placeholder="전체 티어" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">전체 티어</SelectItem>
                  <SelectItem value="1">1티어</SelectItem>
                  <SelectItem value="2">2티어</SelectItem>
                  <SelectItem value="3">3티어</SelectItem>
                  <SelectItem value="4">4티어</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterRace} onValueChange={setFilterRace}>
                <SelectTrigger className="w-36 bg-card border-border text-foreground">
                  <SelectValue placeholder="전체 종족" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">전체 종족</SelectItem>
                  <SelectItem value="T">Terran</SelectItem>
                  <SelectItem value="P">Protoss</SelectItem>
                  <SelectItem value="Z">Zerg</SelectItem>
                </SelectContent>
              </Select>

              {(filterTier !== "__all__" || filterRace !== "__all__") && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setFilterTier("__all__")
                    setFilterRace("__all__")
                  }}
                >
                  필터 초기화
                </Button>
              )}
            </div>
          </div>
          <Button
            onClick={() => {
              setFormData({ name: "", race: "T", tier: 4 })
              setIsAddDialogOpen(true)
            }}
            disabled={pending}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
          >
            <Plus className="h-4 w-4 mr-2" />
            클랜원 추가
          </Button>
        </section>

        <section className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">전체 명단</h2>
              <p className="text-sm text-muted-foreground">총 {filteredMembers.length}명의 클랜원</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground font-semibold w-12 text-center">#</TableHead>
                  <TableHead className="text-muted-foreground font-semibold">선수명</TableHead>
                  <TableHead className="text-muted-foreground font-semibold text-center">종족</TableHead>
                  <TableHead className="text-muted-foreground font-semibold text-center">티어</TableHead>
                  <TableHead className="text-muted-foreground font-semibold text-center w-32">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMembers.map((member, index) => (
                  <TableRow key={member.id} className="border-border hover:bg-secondary/50 transition-colors">
                    <TableCell className="text-center text-muted-foreground font-mono">{index + 1}</TableCell>
                    <TableCell>
                      <span className="font-semibold text-foreground">{member.name}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={raceColors[member.race]}>
                        {raceNames[member.race]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={tierColors[member.tier]}>
                        {member.tier}티어
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                          onClick={() => openEditDialog(member)}
                          disabled={pending}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => openDeleteDialog(member)}
                          disabled={pending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {filteredMembers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Users className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-lg">검색 결과가 없습니다</p>
              <p className="text-sm">선수 이름을 확인해주세요</p>
            </div>
          )}
        </section>

        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent className="bg-card border-border text-foreground">
            <DialogHeader>
              <DialogTitle>클랜원 추가</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">선수명</label>
                <Input
                  placeholder="선수 이름 입력"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="bg-input border-border text-foreground"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">종족</label>
                <Select
                  value={formData.race}
                  onValueChange={(value) => setFormData({ ...formData, race: value as Race })}
                >
                  <SelectTrigger className="bg-input border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="T">Terran</SelectItem>
                    <SelectItem value="P">Protoss</SelectItem>
                    <SelectItem value="Z">Zerg</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">티어</label>
                <Select
                  value={String(formData.tier)}
                  onValueChange={(value) =>
                    setFormData({ ...formData, tier: Number(value) as CliqueTier })
                  }
                >
                  <SelectTrigger className="bg-input border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="1">1티어 (최상위)</SelectItem>
                    <SelectItem value="2">2티어</SelectItem>
                    <SelectItem value="3">3티어</SelectItem>
                    <SelectItem value="4">4티어</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} className="border-border text-foreground">
                취소
              </Button>
              <Button onClick={handleAdd} disabled={pending} className="bg-primary text-primary-foreground">
                추가
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="bg-card border-border text-foreground">
            <DialogHeader>
              <DialogTitle>클랜원 수정</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">선수명</label>
                <Input
                  placeholder="선수 이름 입력"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="bg-input border-border text-foreground"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">종족</label>
                <Select
                  value={formData.race}
                  onValueChange={(value) => setFormData({ ...formData, race: value as Race })}
                >
                  <SelectTrigger className="bg-input border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="T">Terran</SelectItem>
                    <SelectItem value="P">Protoss</SelectItem>
                    <SelectItem value="Z">Zerg</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">티어</label>
                <Select
                  value={String(formData.tier)}
                  onValueChange={(value) =>
                    setFormData({ ...formData, tier: Number(value) as CliqueTier })
                  }
                >
                  <SelectTrigger className="bg-input border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="1">1티어 (최상위)</SelectItem>
                    <SelectItem value="2">2티어</SelectItem>
                    <SelectItem value="3">3티어</SelectItem>
                    <SelectItem value="4">4티어</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} className="border-border text-foreground">
                취소
              </Button>
              <Button onClick={handleEdit} disabled={pending} className="bg-primary text-primary-foreground">
                저장
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent className="bg-card border-border">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-foreground">클랜원 삭제</AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground">
                정말로 <span className="text-foreground font-semibold">{selectedMember?.name}</span> 선수를 명단에서
                삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-border text-foreground">취소</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={pending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                삭제
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </main>
  )
}

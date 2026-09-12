"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
  ArrowUpRight as LinkArrow,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock3,
  Droplets,
  FileText,
  MoreHorizontal,
  PackageCheck,
  RefreshCw,
  Search,
  Sparkles,
  Truck,
  User,
  Users,
} from "lucide-react";

import { formatCompactCurrency, formatCurrency } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { OverviewData, ScheduleEntry } from "@/lib/services/overview";
import {
  PerformanceChart,
  SERIES,
  type ChartPoint,
} from "@/app/(overview)/overview/performance-chart";

type RangeKey = "week" | "month" | "quarter";

const RANGES: { key: RangeKey; label: string; days: number; buckets: number }[] = [
  { key: "week", label: "Last week", days: 7, buckets: 7 },
  { key: "month", label: "Last month", days: 30, buckets: 10 },
  { key: "quarter", label: "Last quarter", days: 90, buckets: 13 },
];

const QUICK_ACTIONS = [
  { label: "New Order", href: "/orders/new", icon: ClipboardList, tone: "#2a78d6" },
  { label: "Pickup", href: "/delivery?tab=pickups", icon: Truck, tone: "#eb6834" },
  { label: "Delivery", href: "/delivery?tab=deliveries", icon: PackageCheck, tone: "#1baf7a" },
  { label: "Invoice", href: "/billing", icon: FileText, tone: "#7a5cd6" },
];

export function OverviewDashboard({
  data,
  canSeeRevenue,
}: {
  data: OverviewData;
  canSeeRevenue: boolean;
}) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<RangeKey>("month");
  const [rangeOpen, setRangeOpen] = useState(false);
  const [monthOffset, setMonthOffset] = useState<number | null>(null);
  const [railStart, setRailStart] = useState(0);

  // ---------------------------------------------------------------- chart ---
  const months = useMemo(() => {
    const list: { key: string; label: string; offset: number }[] = [];
    const now = new Date();
    for (let back = 3; back >= 0; back -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - back, 1);
      list.push({
        key: `${date.getFullYear()}-${date.getMonth()}`,
        label: date.toLocaleDateString("en-IN", { month: "short" }),
        offset: back,
      });
    }
    return list;
  }, []);

  const chartPoints: ChartPoint[] = useMemo(() => {
    const byDate = new Map(data.performance.map((point) => [point.date, point]));

    // A selected month wins over the preset window — the rail is a drill-in.
    let window = data.performance;
    let bucketCount = RANGES.find((entry) => entry.key === range)?.buckets ?? 10;

    if (monthOffset !== null) {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - monthOffset + 1, 0);
      window = [];
      const cursor = new Date(start);
      while (cursor <= end) {
        const key = cursor.toISOString().slice(0, 10);
        window.push(
          byDate.get(key) ?? { date: key, orders: 0, revenue: 0, completed: 0 },
        );
        cursor.setDate(cursor.getDate() + 1);
      }
      bucketCount = 10;
    } else {
      const days = RANGES.find((entry) => entry.key === range)?.days ?? 30;
      window = data.performance.slice(-days);
    }

    if (window.length === 0) return [];

    // Aggregate into evenly sized buckets so the curve stays smooth rather
    // than spiking between quiet days.
    const size = Math.max(1, Math.ceil(window.length / bucketCount));
    const points: ChartPoint[] = [];

    for (let start = 0; start < window.length; start += size) {
      const slice = window.slice(start, start + size);
      const first = new Date(slice[0].date);
      const last = new Date(slice[slice.length - 1].date);
      const label =
        slice.length === 1
          ? first.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
          : `${first.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${last.toLocaleDateString("en-IN", { day: "numeric" })}`;

      points.push({
        label,
        orders: slice.reduce((sum, point) => sum + point.orders, 0),
        revenue: Math.round(slice.reduce((sum, point) => sum + point.revenue, 0)),
        completed: slice.reduce((sum, point) => sum + point.completed, 0),
      });
    }

    return points;
  }, [data.performance, range, monthOffset]);

  const rangeLabel =
    monthOffset !== null
      ? (months.find((month) => month.offset === monthOffset)?.label ?? "Month")
      : (RANGES.find((entry) => entry.key === range)?.label ?? "Last month");

  const periodOrders = chartPoints.reduce((sum, point) => sum + point.orders, 0);
  const periodRevenue = chartPoints.reduce((sum, point) => sum + point.revenue, 0);

  // --------------------------------------------------------------- search ---
  const needle = query.trim().toLowerCase();

  const schedule = useMemo(
    () =>
      needle
        ? data.schedule.filter((entry) =>
            [entry.title, entry.orderNumber, entry.address, entry.contact, entry.kind]
              .join(" ")
              .toLowerCase()
              .includes(needle),
          )
        : data.schedule,
    [data.schedule, needle],
  );

  const operations = useMemo(
    () =>
      needle
        ? data.operations.filter((station) =>
            station.label.toLowerCase().includes(needle),
          )
        : data.operations,
    [data.operations, needle],
  );

  const actions = useMemo(
    () =>
      needle
        ? QUICK_ACTIONS.filter((action) =>
            action.label.toLowerCase().includes(needle),
          )
        : QUICK_ACTIONS,
    [needle],
  );

  return (
    <div className="min-h-dvh bg-[#d6d7e1] px-3 py-4 sm:px-6 sm:py-8 lg:px-8 lg:py-10 [--ov-series-orders:#eb6834] [--ov-series-revenue:#2a78d6] [--ov-series-completed:#1baf7a]">
      <div className="mx-auto w-full max-w-[1180px] overflow-hidden rounded-[22px] bg-white shadow-[0_30px_70px_-28px_rgba(28,34,64,0.45)]">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_336px]">
          {/* ============================ LEFT ============================ */}
          <div className="flex flex-col bg-[#f7f8fa] px-4 py-5 sm:px-6 sm:py-7">
            <Header
              query={query}
              onQuery={setQuery}
              ownerName={data.business.ownerName}
            />

            <div className="mt-5 grid grid-cols-1 gap-3.5 md:grid-cols-[minmax(0,0.4fr)_minmax(0,0.6fr)]">
              <BusinessProfileCard
                business={data.business}
                refreshing={isRefreshing}
                onRefresh={() => startRefresh(() => router.refresh())}
              />

              <div className="grid grid-rows-[auto_auto] gap-3.5">
                <div className="grid grid-cols-2 gap-3 sm:gap-3.5">
                  <GradientCard
                    variant="priority"
                    title={"Priority\norders"}
                    icon={<Clock3 className="size-4" />}
                    value={`${data.priority.percent}%`}
                    caption="Avg. Completed"
                    detail={`${data.priority.urgentPending} urgent pending`}
                    href="/orders?delayed=true"
                  />
                  <GradientCard
                    variant="tasks"
                    title={"Laundry\ntasks"}
                    icon={<Check className="size-4" />}
                    value={`${data.tasks.percent}%`}
                    caption="Avg. Completed"
                    detail={`Wash ${data.tasks.washing}% · Iron ${data.tasks.ironing}% · Pack ${data.tasks.packing}%`}
                    href="/processing"
                  />
                </div>

                <QuickActionsCard actions={actions} filtered={Boolean(needle)} />
              </div>
            </div>

            <PerformanceSection
              points={chartPoints}
              months={months}
              monthOffset={monthOffset}
              onMonth={(offset) =>
                setMonthOffset((current) => (current === offset ? null : offset))
              }
              railStart={railStart}
              onRail={setRailStart}
              rangeLabel={rangeLabel}
              rangeOpen={rangeOpen}
              onRangeOpen={setRangeOpen}
              onRange={(key) => {
                setRange(key);
                setMonthOffset(null);
                setRangeOpen(false);
              }}
              activeRange={range}
              canSeeRevenue={canSeeRevenue}
              onTimePercent={data.headline.onTimePercent}
              periodOrders={periodOrders}
              periodRevenue={periodRevenue}
            />
          </div>

          {/* ============================ RIGHT =========================== */}
          <aside className="border-t border-[#ecedf3] bg-white px-4 py-5 sm:px-6 sm:py-7 lg:border-l lg:border-t-0">
            <SchedulePanel entries={schedule} filtered={Boolean(needle)} />
            <OperationsPanel stations={operations} filtered={Boolean(needle)} />
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================== */
/*  Header                                                                    */
/* ========================================================================== */

function Header({
  query,
  onQuery,
  ownerName,
}: {
  query: string;
  onQuery: (value: string) => void;
  ownerName: string;
}) {
  const firstName = ownerName.split(" ")[0] || ownerName;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4d8ef0] to-[#2a5fd0] text-white shadow-[0_6px_16px_-6px_rgba(42,95,208,0.9)]">
          <Droplets className="size-[18px]" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-[19px] font-semibold leading-tight tracking-[-0.01em] text-[#1b2136]">
            Welcome, {firstName}
          </h1>
          <p className="truncate text-[11.5px] text-[#8b91a3]">
            Your laundry business overview
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <form
          className="relative flex-1 sm:w-[184px] sm:flex-none"
          onSubmit={(event) => event.preventDefault()}
          role="search"
        >
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-[15px] -translate-y-1/2 text-[#9aa0b1]"
            aria-hidden
          />
          <input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search"
            aria-label="Search schedule, stations and actions"
            className="h-10 w-full rounded-full border border-transparent bg-[#eceef3] pl-9 pr-8 text-[13px] text-[#20263a] outline-none transition placeholder:text-[#9aa0b1] focus:border-[#c8d5ef] focus:bg-white"
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQuery("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-[#9aa0b1] transition hover:bg-[#dfe2ea] hover:text-[#20263a]"
            >
              <span aria-hidden>×</span>
            </button>
          ) : null}
        </form>

        <Link
          href="/profile"
          aria-label="Open my profile"
          className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[#e8eaf0] bg-white text-[#5b6276] shadow-[0_2px_6px_-2px_rgba(24,30,54,0.18)] transition hover:border-[#c8d5ef] hover:text-[#2a5fd0]"
        >
          <User className="size-[17px]" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

/* ========================================================================== */
/*  Business profile                                                          */
/* ========================================================================== */

function BusinessProfileCard({
  business,
  refreshing,
  onRefresh,
}: {
  business: OverviewData["business"];
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const initials = business.ownerName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const stats = [
    { icon: Users, value: business.staffCount, label: "staff", tone: "#2a78d6" },
    { icon: Clock3, value: business.activeOrders, label: "active orders", tone: "#eb6834" },
    { icon: Check, value: business.completedOrders, label: "completed orders", tone: "#1baf7a" },
  ];

  return (
    <section className="flex flex-col rounded-[20px] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_-16px_rgba(16,24,40,0.22)]">
      <div className="flex items-start justify-between">
        <h2 className="text-[13px] font-semibold text-[#3d4354]">Business Profile</h2>
        <button
          type="button"
          onClick={onRefresh}
          aria-label="Refresh business figures"
          className="text-[#9aa0b1] transition hover:text-[#2a5fd0] disabled:opacity-50"
          disabled={refreshing}
        >
          <RefreshCw className={cn("size-4", refreshing && "animate-spin")} aria-hidden />
        </button>
      </div>

      <div className="mt-5 flex flex-col items-center">
        <div className="relative">
          <div className="rounded-full bg-[conic-gradient(from_210deg,#f4756b_0deg,#f6a37c_90deg,#efe3ea_190deg,#e8eaf2_260deg,#f4756b_360deg)] p-[3px]">
            <div className="rounded-full bg-white p-[3px]">
              <OwnerAvatar initials={initials} name={business.ownerName} />
            </div>
          </div>
          <span className="absolute bottom-1 right-1 flex size-[26px] items-center justify-center rounded-full border-[2.5px] border-white bg-[#1b2136] text-white">
            <Sparkles className="size-3" aria-hidden />
          </span>
        </div>

        <p className="mt-3.5 text-center text-[16px] font-semibold tracking-[-0.01em] text-[#1b2136]">
          {business.name}
        </p>
        <p className="mt-0.5 text-center text-[11.5px] text-[#8b91a3]">
          {business.ownerName} · {business.ownerRole}
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {stats.map((stat) => (
          <span
            key={stat.label}
            title={`${stat.value} ${stat.label}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#eceef4] bg-white px-3 py-1.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
          >
            <stat.icon className="size-3.5" style={{ color: stat.tone }} aria-hidden />
            <span className="text-[12.5px] font-semibold tabular-nums text-[#1b2136]">
              {stat.value}
            </span>
            <span className="sr-only">{stat.label}</span>
          </span>
        ))}
      </div>
    </section>
  );
}

/**
 * A drawn portrait rather than a stock photo — it never 404s, needs no remote
 * host, and still reads as a picture of a person the way the layout expects.
 * Initials stay in the accessible name so the avatar is never just decoration.
 */
function OwnerAvatar({ initials, name }: { initials: string; name: string }) {
  return (
    <svg
      viewBox="0 0 92 92"
      className="size-[92px] rounded-full"
      role="img"
      aria-label={`${name}${initials ? ` (${initials})` : ""}`}
    >
      <defs>
        <linearGradient id="ov-avatar-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e4ecfb" />
          <stop offset="100%" stopColor="#f6eef0" />
        </linearGradient>
        <clipPath id="ov-avatar-clip">
          <circle cx="46" cy="46" r="46" />
        </clipPath>
      </defs>

      <g clipPath="url(#ov-avatar-clip)">
        <rect width="92" height="92" fill="url(#ov-avatar-bg)" />
        {/* shoulders */}
        <path
          d="M12 92c0-17.5 15.2-29 34-29s34 11.5 34 29z"
          fill="#3d5a9c"
        />
        <path
          d="M35 66c3.4 4 18.2 4 22 0l-4-9H39z"
          fill="#f2d3c4"
        />
        {/* head */}
        <ellipse cx="46" cy="41" rx="17" ry="19" fill="#f7ddcd" />
        {/* hair */}
        <path
          d="M46 18c11.6 0 19 7.6 19 19 0 4.4-.8 8-2.2 11 .6-6.7-1.2-10.6-3-12.6-4.6 3.2-12 4-17.4 2.6-4 -1-6.6-2.6-8.4-4.4-2.2 2.6-3.6 7-3 14.4C29.6 45 28 41.4 28 37c0-11.4 7.4-19 18-19z"
          fill="#2f2a33"
        />
        <path d="M29 44c-2.6 0-4 2.4-3.4 5 .6 2.6 2.6 4 4.4 3.4z" fill="#2f2a33" />
        <path d="M63 44c2.6 0 4 2.4 3.4 5-.6 2.6-2.6 4-4.4 3.4z" fill="#2f2a33" />
        {/* glasses, echoing the reference portrait */}
        <g stroke="#2f2a33" strokeWidth="1.6" fill="none" opacity="0.85">
          <circle cx="39" cy="41" r="6" />
          <circle cx="53" cy="41" r="6" />
          <path d="M45 41h2" />
        </g>
        <path
          d="M40.5 50c1.8 1.8 9.2 1.8 11 0"
          stroke="#d9a58c"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
        />
      </g>
    </svg>
  );
}

/* ========================================================================== */
/*  Gradient metric cards                                                     */
/* ========================================================================== */

const GRADIENTS = {
  priority:
    "radial-gradient(115% 125% at 90% 4%, #f7795f 0%, rgba(247,121,95,0) 60%), radial-gradient(115% 115% at 4% 98%, #cdb9e8 0%, rgba(205,185,232,0) 64%), linear-gradient(152deg, #f9d2da 0%, #f8b7a6 46%, #f0bbd0 100%)",
  tasks:
    "radial-gradient(120% 120% at 6% 6%, #8fe9cb 0%, rgba(143,233,203,0) 56%), radial-gradient(130% 130% at 96% 96%, #2f7df0 0%, rgba(47,125,240,0) 62%), linear-gradient(145deg, #85e2e8 0%, #5dc3f0 48%, #3f8cf2 100%)",
} as const;

function GradientCard({
  variant,
  title,
  icon,
  value,
  caption,
  detail,
  href,
}: {
  variant: keyof typeof GRADIENTS;
  title: string;
  icon: React.ReactNode;
  value: string;
  caption: string;
  detail: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-[176px] flex-col justify-between rounded-[20px] p-4 sm:min-h-[196px] sm:p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_30px_-18px_rgba(16,24,40,0.4)] transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2a5fd0] focus-visible:ring-offset-2"
      style={{ backgroundImage: GRADIENTS[variant] }}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="whitespace-pre-line text-[13.5px] font-semibold leading-[1.25] text-[#1b2136]">
          {title}
        </h3>
        <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[11px] bg-white/55 text-[#1b2136] shadow-[0_2px_8px_-4px_rgba(24,30,54,0.4)] backdrop-blur-sm transition group-hover:bg-white/75">
          {icon}
        </span>
      </div>

      <div>
        <p className="text-[28px] font-semibold leading-none tracking-[-0.02em] text-[#1b2136] tabular-nums sm:text-[34px]">
          {value}
        </p>
        <p className="mt-1.5 text-[11.5px] text-[#3f4658]">{caption}</p>
        <p className="mt-0.5 text-[11px] text-[#3f4658]/75">{detail}</p>
      </div>
    </Link>
  );
}

/* ========================================================================== */
/*  Quick actions                                                             */
/* ========================================================================== */

function QuickActionsCard({
  actions,
  filtered,
}: {
  actions: typeof QUICK_ACTIONS;
  filtered: boolean;
}) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_-18px_rgba(16,24,40,0.22)]">
      <div className="min-w-0">
        <h3 className="text-[13.5px] font-semibold text-[#1b2136]">Quick Actions</h3>
        <p className="text-[11.5px] text-[#8b91a3]">
          {filtered
            ? `${actions.length} matching shortcut${actions.length === 1 ? "" : "s"}`
            : `${QUICK_ACTIONS.length} shortcuts ready`}
        </p>
      </div>

      <div className="flex items-center gap-1.5">
        {actions.map((action) => (
          <Link
            key={action.label}
            href={action.href}
            title={action.label}
            aria-label={action.label}
            className="flex size-[34px] items-center justify-center rounded-full border border-[#eceef4] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.08)] transition hover:-translate-y-0.5 hover:border-transparent hover:shadow-[0_6px_14px_-6px_rgba(16,24,40,0.4)]"
          >
            <action.icon className="size-4" style={{ color: action.tone }} aria-hidden />
          </Link>
        ))}
        {actions.length === 0 ? (
          <p className="text-[11.5px] text-[#9aa0b1]">No matching action</p>
        ) : (
          <Link
            href="/dashboard"
            aria-label="Open the full dashboard"
            title="More"
            className="flex size-[34px] items-center justify-center rounded-full text-[#9aa0b1] transition hover:bg-[#f1f2f6] hover:text-[#1b2136]"
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </Link>
        )}
      </div>
    </section>
  );
}

/* ========================================================================== */
/*  Performance                                                               */
/* ========================================================================== */

function PerformanceSection({
  points,
  months,
  monthOffset,
  onMonth,
  railStart,
  onRail,
  rangeLabel,
  rangeOpen,
  onRangeOpen,
  onRange,
  activeRange,
  canSeeRevenue,
  onTimePercent,
  periodOrders,
  periodRevenue,
}: {
  points: ChartPoint[];
  months: { key: string; label: string; offset: number }[];
  monthOffset: number | null;
  onMonth: (offset: number) => void;
  railStart: number;
  onRail: (value: number) => void;
  rangeLabel: string;
  rangeOpen: boolean;
  onRangeOpen: (open: boolean) => void;
  onRange: (key: RangeKey) => void;
  activeRange: RangeKey;
  canSeeRevenue: boolean;
  onTimePercent: number;
  periodOrders: number;
  periodRevenue: number;
}) {
  const [showTable, setShowTable] = useState(false);
  const visible = months.slice(railStart, railStart + 4);
  const series = SERIES.filter((entry) => entry.key !== "revenue" || canSeeRevenue);

  return (
    <section className="mt-5 flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15.5px] font-semibold tracking-[-0.01em] text-[#1b2136]">
            Laundry Performance
          </h2>
          <p className="text-[11.5px] text-[#8b91a3]">
            Orders, revenue and completions · each shown against its own peak
          </p>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => onRangeOpen(!rangeOpen)}
            aria-expanded={rangeOpen}
            aria-haspopup="listbox"
            className="flex items-center gap-2 rounded-full border border-[#e8eaf0] bg-white px-4 py-2 text-[12.5px] text-[#1b2136] shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition hover:border-[#c8d5ef]"
          >
            <span className="text-[#8b91a3]">Range:</span>
            <span className="font-medium">{rangeLabel}</span>
            <ChevronDown
              className={cn("size-3.5 text-[#8b91a3] transition", rangeOpen && "rotate-180")}
              aria-hidden
            />
          </button>

          {rangeOpen ? (
            <>
              <button
                type="button"
                aria-label="Close range menu"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => onRangeOpen(false)}
              />
              <ul
                role="listbox"
                className="absolute right-0 z-20 mt-1.5 w-44 overflow-hidden rounded-xl border border-[#e8eaf0] bg-white p-1 shadow-[0_18px_40px_-18px_rgba(24,30,54,0.45)]"
              >
                {RANGES.map((entry) => (
                  <li key={entry.key}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={monthOffset === null && activeRange === entry.key}
                      onClick={() => onRange(entry.key)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[12.5px] transition hover:bg-[#f3f5f9]",
                        monthOffset === null && activeRange === entry.key
                          ? "font-medium text-[#2a5fd0]"
                          : "text-[#3d4354]",
                      )}
                    >
                      {entry.label}
                      {monthOffset === null && activeRange === entry.key ? (
                        <Check className="size-3.5" aria-hidden />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex min-h-[210px] flex-1 gap-2 sm:gap-3">
        {/* Month rail — a drill-in, so selecting a month overrides the preset. */}
        <div className="flex shrink-0 flex-col items-center gap-1.5 pt-2">
          <button
            type="button"
            onClick={() => onRail(Math.max(0, railStart - 1))}
            disabled={railStart === 0}
            aria-label="Earlier months"
            className="text-[#b6bbc9] transition hover:text-[#1b2136] disabled:opacity-30"
          >
            <ChevronUp className="size-4" aria-hidden />
          </button>

          {visible.map((month) => {
            // The window always ends today, so with no drill-in the current
            // month is the one on screen.
            const active = (monthOffset ?? 0) === month.offset;
            return (
              <button
                key={month.key}
                type="button"
                onClick={() => onMonth(month.offset)}
                aria-pressed={active}
                className={cn(
                  "w-[42px] rounded-full py-1.5 text-[11.5px] font-medium transition",
                  active
                    ? "bg-[#2a5fd0] text-white shadow-[0_6px_14px_-6px_rgba(42,95,208,0.9)]"
                    : "text-[#8b91a3] hover:bg-[#eceef3] hover:text-[#1b2136]",
                )}
              >
                {month.label}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => onRail(Math.min(Math.max(0, months.length - 4), railStart + 1))}
            disabled={railStart >= months.length - 4}
            aria-label="Later months"
            className="text-[#b6bbc9] transition hover:text-[#1b2136] disabled:opacity-30"
          >
            <ChevronDown className="size-4" aria-hidden />
          </button>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <PerformanceChart points={points} showRevenue={canSeeRevenue} />
        </div>
      </div>

      <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {series.map((entry) => (
              <li
                key={entry.key}
                className="flex items-center gap-1.5 text-[11.5px] text-[#6b7286]"
              >
                <span
                  className="size-2.5 rounded-[3px]"
                  style={{ backgroundColor: entry.color }}
                  aria-hidden
                />
                {entry.label}
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => setShowTable((open) => !open)}
            aria-expanded={showTable}
            className="self-start text-[11px] text-[#9aa0b1] underline-offset-2 transition hover:text-[#1b2136] hover:underline"
          >
            {showTable ? "Hide table" : "View as table"}
          </button>
        </div>

        <div className="text-right">
          <p className="text-[26px] font-semibold leading-none tracking-[-0.02em] text-[#1b2136] tabular-nums">
            {onTimePercent}%
          </p>
          <p className="mt-1 text-[11.5px] text-[#8b91a3]">On-time delivery</p>
          <p className="text-[10.5px] text-[#a4aab8]">
            {periodOrders} orders
            {canSeeRevenue ? ` · ${formatCompactCurrency(periodRevenue)}` : ""}
          </p>
        </div>
      </div>

      {showTable ? (
        <div className="mt-3 max-h-52 overflow-auto rounded-xl border border-[#eceef4]">
          <table className="w-full text-[11.5px]">
            <thead className="sticky top-0 bg-[#f7f8fa]">
              <tr className="text-left text-[#8b91a3]">
                <th className="px-3 py-2 font-medium">Period</th>
                {series.map((entry) => (
                  <th key={entry.key} className="px-3 py-2 text-right font-medium">
                    {entry.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.label} className="border-t border-[#f1f2f6]">
                  <td className="px-3 py-1.5 text-[#3d4354]">{point.label}</td>
                  {series.map((entry) => (
                    <td
                      key={entry.key}
                      className="px-3 py-1.5 text-right tabular-nums text-[#1b2136]"
                    >
                      {entry.key === "revenue"
                        ? formatCurrency(point.revenue)
                        : point[entry.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

/* ========================================================================== */
/*  Today's schedule                                                          */
/* ========================================================================== */

function SchedulePanel({
  entries,
  filtered,
}: {
  entries: ScheduleEntry[];
  filtered: boolean;
}) {
  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-[#1b2136]">
          Today&apos;s Schedule
        </h2>
        <Link
          href="/delivery"
          aria-label="Open pickup and delivery planner"
          className="flex size-9 items-center justify-center rounded-full border border-[#e8eaf0] bg-white text-[#5b6276] shadow-[0_1px_3px_rgba(16,24,40,0.08)] transition hover:border-[#c8d5ef] hover:text-[#2a5fd0]"
        >
          <CalendarDays className="size-4" aria-hidden />
        </Link>
      </div>

      {entries.length === 0 ? (
        <p className="py-8 text-[12.5px] text-[#9aa0b1]">
          {filtered
            ? "Nothing on the schedule matches that search."
            : "No pickups or deliveries left today."}
        </p>
      ) : (
        <ul className="mt-4">
          {entries.map((entry) => {
            const at = new Date(entry.at);
            return (
              <li key={entry.id} className="border-b border-[#f0f1f5] last:border-0">
                <Link
                  href={entry.href}
                  className="group flex items-start gap-3 py-3.5 transition"
                >
                  <div className="w-[74px] shrink-0">
                    <p className="text-[10.5px] text-[#9aa0b1]">
                      {at.toLocaleDateString("en-IN", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                    <p className="text-[12px] font-semibold text-[#1b2136] tabular-nums">
                      {at.toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                      })}
                    </p>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium leading-snug text-[#1b2136] group-hover:text-[#2a5fd0]">
                      {entry.title}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[#8b91a3]">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor:
                            entry.kind === "PICKUP" ? "#eb6834" : "#2a78d6",
                        }}
                        aria-hidden
                      />
                      <span className="truncate">
                        {entry.kind === "PICKUP" ? "Pickup" : "Delivery"} ·{" "}
                        {entry.orderNumber}
                        {entry.amountToCollect > 0
                          ? ` · ${formatCurrency(entry.amountToCollect)}`
                          : ""}
                      </span>
                      {entry.overdue ? (
                        <span className="shrink-0 rounded-full bg-[#eb6834]/12 px-1.5 py-0.5 text-[10px] font-medium text-[#c2521f]">
                          Overdue
                        </span>
                      ) : null}
                    </p>
                  </div>

                  <LinkArrow
                    className="mt-0.5 size-4 shrink-0 text-[#b6bbc9] transition group-hover:text-[#2a5fd0]"
                    aria-hidden
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Link
        href="/delivery"
        className="mt-3 inline-flex items-center gap-1 text-[12px] text-[#5b6276] transition hover:text-[#2a5fd0]"
      >
        See full schedule
        <ChevronDown className="size-3.5 -rotate-90" aria-hidden />
      </Link>
    </section>
  );
}

/* ========================================================================== */
/*  Operations                                                                */
/* ========================================================================== */

function OperationsPanel({
  stations,
  filtered,
}: {
  stations: OverviewData["operations"];
  filtered: boolean;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-[#1b2136]">
        Laundry Operations
      </h2>
      <p className="mt-0.5 text-[11.5px] text-[#8b91a3]">
        Share of work cleared at each station
      </p>

      {stations.length === 0 ? (
        <p className="py-6 text-[12.5px] text-[#9aa0b1]">
          {filtered ? "No station matches that search." : "No stations configured."}
        </p>
      ) : (
        <ul className="mt-4 max-w-[520px] space-y-[18px] lg:max-w-none">
          {stations.map((station) => (
            <li key={station.stage} className="flex items-center gap-3">
              <span className="w-[74px] shrink-0 text-[12.5px] text-[#3d4354]">
                {station.label}
              </span>

              <div
                className="h-[7px] flex-1 overflow-hidden rounded-full bg-[#eceef3]"
                role="meter"
                aria-valuenow={station.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${station.label} cleared`}
                title={`${station.done} cleared · ${station.waiting} waiting`}
              >
                <div
                  className="h-full rounded-full bg-[#2a5fd0] transition-[width] duration-700 ease-out"
                  style={{ width: `${Math.max(2, station.percent)}%` }}
                />
              </div>

              <span className="w-8 shrink-0 text-right text-[11.5px] text-[#5b6276] tabular-nums">
                {station.percent}%
              </span>

              <span
                className={cn(
                  "flex size-[18px] shrink-0 items-center justify-center rounded-full",
                  station.trend === "up"
                    ? "bg-[#2a5fd0]/12 text-[#2a5fd0]"
                    : "bg-[#eb6834]/14 text-[#eb6834]",
                )}
                title={
                  station.trend === "up"
                    ? "Clearing faster than the queue is growing"
                    : "Queue is growing faster than it clears"
                }
              >
                {station.trend === "up" ? (
                  <ArrowUpRight className="size-3" aria-hidden />
                ) : (
                  <ArrowDownRight className="size-3" aria-hidden />
                )}
                <span className="sr-only">
                  {station.trend === "up" ? "trending up" : "trending down"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

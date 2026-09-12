import Link from "next/link";
import { ArrowLeft, Shirt } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  GarmentTypeDialog,
  RateInput,
  ServiceDialog,
} from "@/app/(app)/settings/settings-dialogs";
import { prisma } from "@/lib/prisma";
import { formatCurrency, num } from "@/lib/money";
import { PERMISSIONS } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { humanize } from "@/lib/utils";
import { STAGE_LABELS } from "@/lib/workflow";
import type { ProcessingStage } from "@/generated/prisma/enums";

export const metadata = { title: "Catalogue" };

export default async function CataloguePage() {
  await requirePermission(PERMISSIONS.CATALOGUE_MANAGE);

  const [services, garmentTypes, rates] = await Promise.all([
    prisma.service.findMany({ orderBy: { name: "asc" } }),
    prisma.garmentType.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] }),
    prisma.serviceRate.findMany(),
  ]);

  const rateMap = new Map(
    rates.map((rate) => [`${rate.serviceId}:${rate.garmentTypeId}`, num(rate.price)]),
  );

  const activeServices = services.filter((service) => service.isActive);
  const activeTypes = garmentTypes.filter((type) => type.isActive);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Services & garments"
        description="The catalogue the counter prices orders from."
        actions={
          <>
            <Button asChild variant="outline" size="icon" aria-label="Back to settings">
              <Link href="/settings">
                <ArrowLeft />
              </Link>
            </Button>
            <GarmentTypeDialog />
            <ServiceDialog />
          </>
        }
      />

      <Tabs defaultValue="services">
        <TabsList>
          <TabsTrigger value="services">Services ({services.length})</TabsTrigger>
          <TabsTrigger value="garments">Garment types ({garmentTypes.length})</TabsTrigger>
          <TabsTrigger value="rates">Rate matrix</TabsTrigger>
        </TabsList>

        <TabsContent value="services">
          {services.length === 0 ? (
            <EmptyState
              icon={Shirt}
              title="No services"
              description="Add the services you offer — wash and fold, dry clean, ironing…"
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((service) => (
                <Card key={service.id}>
                  <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">{service.name}</CardTitle>
                      <p className="font-mono text-xs text-muted-foreground">
                        {service.code}
                      </p>
                    </div>
                    <StatusBadge status={service.isActive ? "ACTIVE" : "INACTIVE"} />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-baseline justify-between">
                      <span className="text-lg font-semibold numeric">
                        {formatCurrency(service.basePrice)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {humanize(service.pricingMode)} · {service.turnaroundHours}h
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {service.stages.map((stage) => (
                        <Badge key={stage} tone="neutral">
                          {STAGE_LABELS[stage as ProcessingStage]}
                        </Badge>
                      ))}
                    </div>
                    {service.description ? (
                      <p className="text-xs text-muted-foreground">{service.description}</p>
                    ) : null}
                    <ServiceDialog
                      service={{
                        id: service.id,
                        code: service.code,
                        name: service.name,
                        description: service.description,
                        pricingMode: service.pricingMode,
                        basePrice: num(service.basePrice),
                        turnaroundHours: service.turnaroundHours,
                        stages: service.stages as string[],
                        isActive: service.isActive,
                      }}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="garments">
          {garmentTypes.length === 0 ? (
            <EmptyState
              icon={Shirt}
              title="No garment types"
              description="Add shirts, trousers, sarees, linen — whatever you take in."
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5 text-left">Garment</th>
                      <th className="px-4 py-2.5 text-left">Category</th>
                      <th className="px-4 py-2.5 text-left">Status</th>
                      <th className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {garmentTypes.map((type) => (
                      <tr key={type.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-2.5">
                          <p className="font-medium">{type.name}</p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {type.code}
                          </p>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {humanize(type.category)}
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusBadge status={type.isActive ? "ACTIVE" : "INACTIVE"} />
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <GarmentTypeDialog
                            garmentType={{
                              id: type.id,
                              code: type.code,
                              name: type.name,
                              category: type.category,
                              isActive: type.isActive,
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="rates">
          {activeServices.length === 0 || activeTypes.length === 0 ? (
            <EmptyState
              title="Nothing to price yet"
              description="Add at least one active service and one active garment type."
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  Rate per garment type
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Leave a cell at zero to fall back to the service&apos;s base price.
                  Corporate contracts override both.
                </p>
              </CardHeader>
              <CardContent className="overflow-x-auto scrollbar-thin p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="sticky left-0 bg-card px-4 py-2.5 text-left">
                        Garment
                      </th>
                      {activeServices.map((service) => (
                        <th key={service.id} className="px-3 py-2.5 text-right">
                          {service.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeTypes.map((type) => (
                      <tr key={type.id} className="border-b border-border last:border-0">
                        <td className="sticky left-0 bg-card px-4 py-2">
                          <p className="whitespace-nowrap font-medium">{type.name}</p>
                        </td>
                        {activeServices.map((service) => (
                          <td key={service.id} className="px-3 py-2 text-right">
                            <RateInput
                              serviceId={service.id}
                              garmentTypeId={type.id}
                              price={rateMap.get(`${service.id}:${type.id}`) ?? null}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

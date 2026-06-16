// app/(dashboard)/catalogo/page.tsx
'use client';

import { ServicosTab } from '@/components/catalogo/servicos-tab';
import { SubtiposTab } from '@/components/catalogo/subtipos-tab';
import { TiposTab } from '@/components/catalogo/tipos-tab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function CatalogoPage() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Catálogo de Serviços</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Gerencie os serviços de manutenção, seus tipos e subtipos
        </p>
      </div>

      <Tabs defaultValue="servicos">
        <TabsList>
          <TabsTrigger value="servicos">Serviços</TabsTrigger>
          <TabsTrigger value="tipos">Tipos</TabsTrigger>
          <TabsTrigger value="subtipos">Subtipos</TabsTrigger>
        </TabsList>

        <TabsContent value="servicos" className="mt-4 sm:mt-6">
          <ServicosTab />
        </TabsContent>
        <TabsContent value="tipos" className="mt-4 sm:mt-6">
          <TiposTab />
        </TabsContent>
        <TabsContent value="subtipos" className="mt-4 sm:mt-6">
          <SubtiposTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

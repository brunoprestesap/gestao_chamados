'use client';

import { Layers, ListTree, Settings2 } from 'lucide-react';

import { ServicosTab } from '@/components/catalogo/servicos-tab';
import { SubtiposTab } from '@/components/catalogo/subtipos-tab';
import { TiposTab } from '@/components/catalogo/tipos-tab';
import { PageHeader } from '@/components/dashboard/header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function CatalogoPage() {
  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title="Catálogo de Serviços"
        subtitle="Gerencie os serviços de manutenção, seus tipos e subtipos"
      />

      <Tabs defaultValue="servicos" className="w-full">
        <TabsList className="h-12 w-full justify-start rounded-xl bg-muted/50 p-1">
          <TabsTrigger value="servicos" className="flex-1 gap-2 rounded-lg sm:flex-none">
            <Settings2 className="h-4 w-4" />
            Serviços
          </TabsTrigger>
          <TabsTrigger value="tipos" className="flex-1 gap-2 rounded-lg sm:flex-none">
            <Layers className="h-4 w-4" />
            Tipos
          </TabsTrigger>
          <TabsTrigger value="subtipos" className="flex-1 gap-2 rounded-lg sm:flex-none">
            <ListTree className="h-4 w-4" />
            Subtipos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="servicos" className="mt-6 focus-visible:outline-none">
          <ServicosTab />
        </TabsContent>
        <TabsContent value="tipos" className="mt-6 focus-visible:outline-none">
          <TiposTab />
        </TabsContent>
        <TabsContent value="subtipos" className="mt-6 focus-visible:outline-none">
          <SubtiposTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

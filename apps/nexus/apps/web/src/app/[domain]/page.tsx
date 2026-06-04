'use client'

export const runtime = 'edge'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { api } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, ChevronRight, Loader2 } from 'lucide-react'
import Link from 'next/link'
import type { Category, Domain } from '@nexus/types'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

function CategoryCard({ category, domainSlug }: { category: Category; domainSlug: string }) {
  return (
    <Link href={`/${domainSlug}/${category.slug}`}>
      <Card className="hover:border-primary/50 transition-all cursor-pointer group">
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="text-2xl">{category.icon || '📁'}</div>
            <div>
              <h3 className="font-semibold group-hover:text-primary transition-colors">
                {category.name}
              </h3>
              {category.description && (
                <p className="text-sm text-muted-foreground line-clamp-1">
                  {category.description}
                </p>
              )}
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
        </CardContent>
      </Card>
    </Link>
  )
}

export default function DomainPage() {
  const params = useParams()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getDomains().then((domains: Domain[]) => {
      const domain = domains.find((d) => d.slug === params.domain)
      if (domain) {
        api.getCategories(domain.id).then(setCategories)
      }
    }).finally(() => setLoading(false))
  }, [params.domain])

  return (
    <>
      <PageHeader
        title={<span className="capitalize">{params.domain}</span>}
        subtitle="Choose a category to create your product"
      />
      <PageBody>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {categories.map((category) => (
              <CategoryCard key={category.id} category={category} domainSlug={params.domain as string} />
            ))}

            <Link href={`/manager/categories?action=new&domain=${params.domain}`}>
              <Card className="border-dashed hover:border-primary/50 transition-all cursor-pointer">
                <CardContent className="flex items-center justify-center gap-2 p-4 text-muted-foreground hover:text-primary">
                  <Plus className="w-5 h-5" />
                  <span>Add Category</span>
                </CardContent>
              </Card>
            </Link>
          </div>
        )}
      </PageBody>
    </>
  )
}

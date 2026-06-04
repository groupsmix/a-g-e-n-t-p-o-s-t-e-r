export interface Domain {
  id: string
  name: string
  slug: string
  description: string | null
  icon: string | null
  color: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Category {
  id: string
  domain_id: string
  name: string
  slug: string
  description: string | null
  icon: string | null
  sort_order: number
  is_active: boolean
  created_at: string
}

export interface DomainWithCategories extends Domain {
  categories: Category[]
}

export type CreateDomainInput = Partial<Pick<Domain, 'name' | 'slug' | 'description' | 'icon' | 'color'>>
export type UpdateDomainInput = Partial<Pick<Domain, 'name' | 'slug' | 'description' | 'icon' | 'color' | 'sort_order' | 'is_active'>>

export type CreateCategoryInput = Partial<Pick<Category, 'name' | 'slug' | 'description' | 'icon'>>
export type UpdateCategoryInput = Partial<Pick<Category, 'name' | 'slug' | 'description' | 'icon' | 'sort_order' | 'is_active'>>

import { SpendingCategoryDefinition } from '../common/common.dto.js'

/**
 * Categories are user data. This compatibility helper intentionally contains
 * no built-in taxonomy; the application supplies definitions from its rules
 * configuration instead.
 */
export function getSpendingCategoryDefinitions(): SpendingCategoryDefinition[] {
    return []
}

export function getSpendingCategoryDefinition(category: string): SpendingCategoryDefinition {
    return {
        category,
        description: 'A configured category without additional metadata.',
        necessity: 'unclassified',
        control: 'influenceable',
        pricePattern: 'variable',
    }
}

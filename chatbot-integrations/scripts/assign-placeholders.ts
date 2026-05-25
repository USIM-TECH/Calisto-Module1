import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const URLS = {
  eyeglasses: [
    "https://images.unsplash.com/photo-1614715838608-dd527c46231d?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8ZXllZ2xhc3Nlc3xlbnwwfHwwfHx8MA%3D%3D",
    "https://images.unsplash.com/photo-1556306510-31ca015374b0?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NHx8ZXllZ2xhc3Nlc3xlbnwwfHwwfHx8MA%3D%3D",
    "https://images.unsplash.com/photo-1646084081219-1090f72a531c?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Nnx8ZXllZ2xhc3Nlc3xlbnwwfHwwfHx8MA%3D%3D",
    "https://images.unsplash.com/photo-1591076482161-42ce6da69f67?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8N3x8ZXllZ2xhc3Nlc3xlbnwwfHwwfHx8MA%3D%3D",
    "https://images.unsplash.com/photo-1603578119639-798b8413d8d7?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTR8fGV5ZWdsYXNzZXN8ZW58MHx8MHx8fDA%3D",
    "https://images.unsplash.com/photo-1574258495973-f010dfbb5371?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTF8fGV5ZWdsYXNzZXN8ZW58MHx8MHx8fDA%3D",
    "https://images.unsplash.com/photo-1589176449149-71f7ea77ec25?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTV8fGV5ZWdsYXNzZXN8ZW58MHx8MHx8fDA%3D",
    "https://images.unsplash.com/photo-1646083774155-2a40b675641d?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MjB8fGV5ZWdsYXNzZXN8ZW58MHx8MHx8fDA%3D",
    "https://images.unsplash.com/photo-1516714819001-8ee7a13b71d7?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTJ8fGV5ZWdsYXNzZXN8ZW58MHx8MHx8fDA%3D",
    "https://plus.unsplash.com/premium_photo-1670424200453-cde113bb085d?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8OXx8ZXllZ2xhc3Nlc3xlbnwwfHwwfHx8MA%3D%3D"
  ],
  sunglasses: [
    "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8c3VuZ2xhc3Nlc3xlbnwwfHwwfHx8MA%3D%3D",
    "https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8M3x8c3VuZ2xhc3Nlc3xlbnwwfHwwfHx8MA%3D%3D",
    "https://plus.unsplash.com/premium_photo-1664110691050-4cd1fb8e3aa4?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8OXx8c3VuZ2xhc3Nlc3xlbnwwfHwwfHx8MA%3D%3D",
    "https://images.unsplash.com/photo-1577803645773-f96470509666?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NHx8c3VuZ2xhc3Nlc3xlbnwwfHwwfHx8MA%3D%3D",
    "https://images.unsplash.com/photo-1584036553516-bf83210aa16c?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Nnx8c3VuZ2xhc3Nlc3xlbnwwfHwwfHx8MA%3D%3D",
    "https://images.unsplash.com/photo-1610136649349-0f646f318053?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8N3x8c3VuZ2xhc3Nlc3xlbnwwfHwwfHx8MA%3D%3D",
    "https://images.unsplash.com/photo-1473496169904-658ba7c44d8a?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTB8fHN1bmdsYXNzZXN8ZW58MHx8MHx8fDA%3D",
    "https://images.unsplash.com/photo-1508296695146-257a814070b4?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTJ8fHN1bmdsYXNzZXN8ZW58MHx8MHx8fDA%3D",
    "https://images.unsplash.com/photo-1559070081-648fb00b2ed1?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MjR8fHN1bmdsYXNzZXN8ZW58MHx8MHx8fDA%3D",
    "https://images.unsplash.com/photo-1567473810954-507d59716c25?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mjh8fHN1bmdsYXNzZXN8ZW58MHx8MHx8fDA%3D"
  ],
  contact_lenses: [
    "https://images.unsplash.com/photo-1582143434535-eba55a806718?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NHx8Y29udGFjdCUyMGxlbnNlc3xlbnwwfHwwfHx8MA%3D%3D",
    "https://images.unsplash.com/photo-1677214467782-e6befd6cdd66?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NDN8fGNvbnRhY3QlMjBsZW5zZXN8ZW58MHx8MHx8fDA%3D",
    "https://images.unsplash.com/photo-1758796540787-c8a96763bdf5?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NTF8fGNvbnRhY3QlMjBsZW5zZXN8ZW58MHx8MHx8fDA%3D",
    "https://images.unsplash.com/photo-1710319305637-33a4b328bc03?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NTB8fGNvbnRhY3QlMjBsZW5zZXN8ZW58MHx8MHx8fDA%3D",
    "https://images.pexels.com/photos/5752279/pexels-photo-5752279.jpeg",
    "https://plus.unsplash.com/premium_photo-1723795245667-334250da1297?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTc5fHxjb250YWN0JTIwbGVuc2VzfGVufDB8fDB8fHwww=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NTR8fGNvbnRhY3QlMjBsZW5zZXN8ZW58MHx8MHx8fDA%3D",
    "https://images.unsplash.com/photo-1720286790380-f773528fda9a?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MjkzfHxjb250YWN0JTIwbGVuc2VzfGVufDB8fDB8fHww",
    "https://images.unsplash.com/photo-1588403169737-c108db285e8e?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NzV8fGNvbnRhY3QlMjBsZW5zZXN8ZW58MHx8MHx8fDA%3D",
    "https://plus.unsplash.com/premium_photo-1661594484964-018a629d14ac?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTAzfHxjb250YWN0JTIwbGVuc2VzfGVufDB8fDB8fHww",
    "https://images.unsplash.com/photo-1587910234573-d6fc84743bc8?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTAyfHxjb250YWN0JTIwbGVuc2VzfGVufDB8fDB8fHww"
  ],
  designer_frames: [
    "https://images.pexels.com/photos/13430474/pexels-photo-13430474.jpeg",
    "https://images.pexels.com/photos/28616333/pexels-photo-28616333.jpeg",
    "https://images.pexels.com/photos/29348782/pexels-photo-29348782.jpeg",
    "https://images.pexels.com/photos/31194175/pexels-photo-31194175.jpeg",
    "https://images.pexels.com/photos/28211037/pexels-photo-28211037.jpeg",
    "https://images.pexels.com/photos/27543858/pexels-photo-27543858.jpeg",
    "https://images.pexels.com/photos/28295161/pexels-photo-28295161.jpeg",
    "https://images.pexels.com/photos/29488630/pexels-photo-29488630.jpeg",
    "https://images.pexels.com/photos/30244333/pexels-photo-30244333.jpeg",
    "https://images.pexels.com/photos/27624600/pexels-photo-27624600.jpeg"
  ]
}

// Function to shuffle an array
function shuffle<T>(array: T[]): T[] {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export async function assign_placeholder_images_to_products() {
  const products = await prisma.product.findMany()
  
  const shuffledPools = {
    eyeglasses: shuffle(URLS.eyeglasses),
    sunglasses: shuffle(URLS.sunglasses),
    contact_lenses: shuffle(URLS.contact_lenses),
    designer_frames: shuffle(URLS.designer_frames),
  }

  const counters = {
    eyeglasses: 0,
    sunglasses: 0,
    contact_lenses: 0,
    designer_frames: 0,
  }

  const updates = []

  for (const product of products) {
    if (product.imageUrl) continue // Skip if it already has a real image URL
    
    const combinedType = `${product.productType || ''} ${product.category || ''}`.toLowerCase()
    let poolKey: keyof typeof URLS
    
    if (combinedType.includes('contact')) {
      poolKey = 'contact_lenses'
    } else if (combinedType.includes('sunglass')) {
      poolKey = 'sunglasses'
    } else if (combinedType.includes('designer')) {
      poolKey = 'designer_frames'
    } else {
      poolKey = 'eyeglasses'
    }

    const pool = shuffledPools[poolKey]
    const assignedUrl = pool[counters[poolKey] % pool.length]
    counters[poolKey]++

    updates.push(
      prisma.product.update({
        where: { productId: product.productId },
        data: { fallbackImageUrl: assignedUrl }
      })
    )
  }

  console.log(`Prepared ${updates.length} updates. Executing batch...`)
  
  // Execute updates in a transaction
  await prisma.$transaction(updates)
  
  console.log('Successfully assigned placeholder images cyclically per category!')
}

if (process.argv[1] === new URL(import.meta.url).pathname || process.argv[1] === __filename) {
  assign_placeholder_images_to_products()
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}

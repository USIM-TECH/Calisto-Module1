# Multilingual QA And Regression Checklist

Use this file to test whether English, Malay, and Mandarin behave consistently across the main journeys.

## How To Use

For each test:

1. Send the prompt.
2. Check the detected intent in Rasa logs if needed.
3. Confirm the reply language matches the user language.
4. Confirm buttons/cards/text are localized.
5. Confirm the next step is correct.
6. Confirm important entities are extracted when applicable.

Use this quick result format while testing:

| Prompt | Expected Intent | Actual Intent | Language OK | Entities OK | Flow OK | Notes |
|---|---|---|---|---|---|---|
| `saya mahu cari kedai di kl` | `find_a_store` |  |  |  |  |  |

## Greeting

| Language | Prompt | Expected |
|---|---|---|
| en | `hi` | Greeting in English with 3 top-level options |
| ms | `hai` | Greeting in Malay with localized options |
| zh | `你好` | Greeting in Mandarin with localized options |

## Store Finder

| Language | Prompt | Expected |
|---|---|---|
| en | `i want a store in kuala lumpur` | `find_a_store`; city=`Kuala Lumpur`; store flow, not lens flow |
| ms | `saya mahu cari kedai di kl` | `find_a_store`; city=`Kuala Lumpur`; store flow in Malay |
| zh | `我想找吉隆坡的门店` | `find_a_store`; city=`Kuala Lumpur`; store flow in Mandarin |
| en | `is there a store at lalaport bukit bintang` | `find_a_store`; city/location recognized; correct store card(s) |
| ms | `ada cawangan di kuala lumpur` | `find_a_store`; city recognized; store lookup in Malay |
| zh | `附近有分店吗` | `find_a_store` or clarify city in Mandarin |

## Store Hours

| Language | Prompt | Expected |
|---|---|---|
| en | `what time does your store open` | `store_hours`; store-hours answer in English |
| ms | `waktu operasi kedai` | `store_hours`; store-hours answer in Malay |
| zh | `门店几点开门` | `store_hours`; store-hours answer in Mandarin |

## Pricing

| Language | Prompt | Expected |
|---|---|---|
| en | `how much are your frames` | `ask_pricing`; pricing flow in English |
| ms | `berapa harga bingkai` | `ask_pricing`; pricing flow in Malay |
| zh | `镜框多少钱` | `ask_pricing`; pricing flow in Mandarin |
| en | `price for gucci frames` | `ask_pricing` or `search_product`; brand=`Gucci` |

## Product Discovery

| Language | Prompt | Expected |
|---|---|---|
| en | `show me designer frames` | `browse_eyewear` or `select_product_type`; product browse flow |
| ms | `tunjukkan cermin mata` | `browse_eyewear`; product browse flow in Malay |
| zh | `给我看看镜框` | `browse_eyewear`; product browse flow in Mandarin |

## Product Recommendation

| Language | Prompt | Expected |
|---|---|---|
| en | `recommend glasses for office use` | `product_recommendation`; use_case recognized |
| ms | `cadangkan cermin mata untuk office` | `product_recommendation`; use_case recognized in Malay |
| zh | `请推荐适合screen使用的眼镜` | `product_recommendation`; use_case recognized in Mandarin |
| en | `what do you recommend for driving` | `product_recommendation`; recommendation should skew sunglasses |

## Booking

| Language | Prompt | Expected |
|---|---|---|
| en | `i want to book an appointment` | `book_appointment`; booking intro + lead capture |
| ms | `saya mahu tempah janji temu` | `book_appointment`; booking intro + lead capture in Malay |
| zh | `我想预约` | `book_appointment`; booking intro + lead capture in Mandarin |

## Reschedule

| Language | Prompt | Expected |
|---|---|---|
| en | `i need to reschedule my appointment` | `reschedule_appointment`; reschedule intro in English |
| ms | `saya mahu ubah janji temu` | `reschedule_appointment`; reschedule flow in Malay |
| zh | `我想改预约时间` | `reschedule_appointment`; reschedule flow in Mandarin |

## After-Sales

| Language | Prompt | Expected |
|---|---|---|
| en | `i need after sales support` | `after_sales_support`; intro in English |
| ms | `saya perlukan bantuan selepas jualan` | `after_sales_support`; intro in Malay |
| zh | `我需要售后服务` | `after_sales_support`; intro in Mandarin |
| en | `my glasses feel loose` | `after_sales_support` or `warranty_claim`; support flow is acceptable |
| zh | `我的镜框松了` | `after_sales_support` or `warranty_claim`; support flow in Mandarin |

## Human Handoff

| Language | Prompt | Expected |
|---|---|---|
| en | `connect me to an agent` | `human_handoff`; intro in English |
| ms | `sambungkan saya dengan konsultan` | `human_handoff`; intro in Malay |
| zh | `请帮我联系顾问` | `human_handoff`; intro in Mandarin |

## Warranty

| Language | Prompt | Expected |
|---|---|---|
| en | `i need to claim warranty` | `warranty_claim`; support flow |
| ms | `saya mahu tuntut waranti` | `warranty_claim`; support flow in Malay |
| zh | `我要申请保修` | `warranty_claim`; support flow in Mandarin |

## Order Tracking

| Language | Prompt | Expected |
|---|---|---|
| en | `help me track order ORD-1024` | `order_tracking`; `order_id` extracted |
| ms | `boleh jejak order saya` | `order_tracking`; flow in Malay |
| zh | `请帮我查询订单状态` | `order_tracking`; flow in Mandarin |

## Lead Capture Fields

| Language | Prompt | Expected |
|---|---|---|
| en | `my name is Darshan` | Name captured |
| ms | `nama saya Farah` | Name captured |
| zh | `我叫王小明` | Name captured |
| en | `my phone number is 0171234567` | Phone captured |
| ms | `nombor saya 0171234567` | Phone captured |
| zh | `我的电话是0127788990` | Phone captured |
| en | `my email is darshan@example.com` | Email captured |
| ms | `emel saya farah@contoh.my` | Email captured |
| zh | `我的邮箱是chen@example.com` | Email captured |

## Attribute Search

| Language | Prompt | Expected |
|---|---|---|
| en | `show me black round glasses` | `search_product_by_attribute`; color + shape extracted |
| ms | `saya mahu bingkai black bentuk round` | `search_product_by_attribute`; color + shape extracted |
| zh | `我想看black色round款眼镜` | `search_product_by_attribute`; color + shape extracted |

## Lens Flow

| Language | Prompt | Expected |
|---|---|---|
| en | `i need blue light lenses` | `lens_vision_solutions` or `ask_lens_type`; lens flow in English |
| ms | `saya mahukan kanta blue light` | `lens_vision_solutions` or `ask_lens_type`; lens flow in Malay |
| zh | `我需要防蓝光镜片` | `lens_vision_solutions` or `ask_lens_type`; lens flow in Mandarin |

## Short Prompt Stability

| Language | Prompt | Expected |
|---|---|---|
| en after Malay conversation | `ok` | Should usually stay in Malay if no stronger English signal exists |
| ms after English conversation | `boleh` | Should switch or stay Malay appropriately |
| zh after Mandarin conversation | `好` | Should stay in Mandarin |

## Regression Failures To Watch

- English question answered in Malay/Mandarin unexpectedly
- Malay/Mandarin question answered in English unexpectedly
- Correct intent but buttons remain English-only
- Store query routed to lens flow
- Booking query routed to FAQ
- Warranty/order tracking routed to generic after-sales when it should be specific
- Free-text multilingual prompts only work when buttons are used
- Canonical values fail:
  - `KL` vs `Kuala Lumpur` vs `吉隆坡`
  - `cermin mata hitam` vs `太阳镜` vs `sunglasses`

## Pass Criteria

Consider multilingual support “close to English parity” when:

1. Core journeys work in all three languages.
2. Response language stays consistent through the flow.
3. Buttons/cards/actions are localized.
4. Canonical entities resolve correctly.
5. Mixed short prompts do not collapse into fallback too often.

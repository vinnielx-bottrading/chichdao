export const occupations=['PT / Huấn luyện viên','Nông dân / Làm vườn','Công nhân / Thợ kỹ thuật','Văn phòng / Sáng tạo','Kinh doanh / Tự do','Khác'];
export const bodyTypes=['Cơ bắp rõ nét','Vạm vỡ','Rắn rỏi','Gọn khỏe'];
export const lifestyles=['Yêu phòng gym','Gần gũi thiên nhiên','Cuộc sống giản dị','Năng động ngoài trời','Đô thị & sáng tạo'];
export const trainingStyles=['Bodybuilding','Powerlifting','Functional','Calisthenics','Vận động qua công việc','Chạy bộ / Thể thao','Không tập cố định'];
// maxOriginalBytes: what users may pick (phones shoot 48–200 MP). maxBytes: what is stored after on-device compression.
export const photoLimits={maxCount:10,maxOriginalBytes:30*1024*1024,maxBytes:8*1024*1024,maxDimension:1600,thumbDimension:480,targetBytes:600*1024,maxPixels:120_000_000};
export function photoValidationError(file){if(!['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(file.type))return 'Chỉ nhận ảnh JPG, PNG, WebP hoặc HEIC.';if(file.size>photoLimits.maxOriginalBytes)return 'Ảnh gốc tối đa 30 MB.';if(file.size<=0)return 'Ảnh không có dữ liệu.';return '';}

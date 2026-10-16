// Gợi ý khu vực: 34 tỉnh/thành Việt Nam (từ 01/07/2025), vài điểm đến quen thuộc, và các thành phố lớn trên thế giới.
// Người dùng vẫn có thể gõ khu vực khác; bộ lọc Khám phá so khớp không dấu, theo chuỗi con.
export const vietnam=['TP. Hồ Chí Minh','Hà Nội','Đà Nẵng','Hải Phòng','Cần Thơ','Huế',
 'An Giang','Bắc Ninh','Cà Mau','Cao Bằng','Đắk Lắk','Điện Biên','Đồng Nai','Đồng Tháp','Gia Lai','Hà Tĩnh','Hưng Yên','Khánh Hòa','Lai Châu','Lâm Đồng','Lạng Sơn','Lào Cai','Nghệ An','Ninh Bình','Phú Thọ','Quảng Ngãi','Quảng Ninh','Quảng Trị','Sơn La','Tây Ninh','Thái Nguyên','Thanh Hóa','Tuyên Quang','Vĩnh Long',
 'Nha Trang, Khánh Hòa','Đà Lạt, Lâm Đồng','Vũng Tàu, TP. Hồ Chí Minh','Phú Quốc, An Giang','Hạ Long, Quảng Ninh','Quy Nhơn, Gia Lai','Hội An, Đà Nẵng','Biên Hòa, Đồng Nai','Thủ Dầu Một, TP. Hồ Chí Minh','Vinh, Nghệ An','Buôn Ma Thuột, Đắk Lắk','Sa Pa, Lào Cai'];
export const world=['Bangkok, Thái Lan','Pattaya, Thái Lan','Phuket, Thái Lan','Chiang Mai, Thái Lan','Singapore','Kuala Lumpur, Malaysia','Jakarta, Indonesia','Bali, Indonesia','Manila, Philippines','Phnom Penh, Campuchia','Siem Reap, Campuchia','Vientiane, Lào',
 'Seoul, Hàn Quốc','Busan, Hàn Quốc','Tokyo, Nhật Bản','Osaka, Nhật Bản','Đài Bắc, Đài Loan','Hồng Kông','Ma Cao','Thượng Hải, Trung Quốc','Bắc Kinh, Trung Quốc','Quảng Châu, Trung Quốc','Thâm Quyến, Trung Quốc',
 'Sydney, Úc','Melbourne, Úc','Brisbane, Úc','Perth, Úc','Auckland, New Zealand',
 'Los Angeles, Mỹ','San Francisco, Mỹ','San Jose, Mỹ','Houston, Mỹ','Dallas, Mỹ','Seattle, Mỹ','New York, Mỹ','Washington DC, Mỹ','Chicago, Mỹ','Miami, Mỹ','Las Vegas, Mỹ','Orange County, Mỹ',
 'Toronto, Canada','Vancouver, Canada','Montréal, Canada',
 'London, Anh','Paris, Pháp','Berlin, Đức','Frankfurt, Đức','Amsterdam, Hà Lan','Praha, Séc','Warszawa, Ba Lan','Moskva, Nga','Madrid, Tây Ban Nha','Barcelona, Tây Ban Nha','Roma, Ý','Milano, Ý','Zürich, Thụy Sĩ','Stockholm, Thụy Điển','Copenhagen, Đan Mạch',
 'Dubai, UAE','Doha, Qatar','Istanbul, Thổ Nhĩ Kỳ','Delhi, Ấn Độ','Mumbai, Ấn Độ'];
export const regions=[...vietnam,...world];
export function regionOptions(){return regions.map(r=>`<option value="${r.replace(/"/g,'&quot;')}"></option>`).join('');}

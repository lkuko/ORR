# The internal release builder compiles admin/dist on the development computer.
FROM nginx:stable-alpine
ENV API_UPSTREAM=http://api:3000
COPY dist /usr/share/nginx/html
COPY default.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 80
